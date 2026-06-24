// Service Worker = 仮想 Web サーバー
// - content/popup からのメッセージ受信（start_preview / start_demo 等）
// - preview/ 配下への fetch をインターセプトし Drive 上のファイルを解決して返す
// 設計は docs/SERVICE_WORKER.md / docs/ARCHITECTURE.md / docs/PERFORMANCE.md を参照。
//
// 注意（MV3）: リスナはトップレベルで同期登録する。状態はメモリに持たず
// chrome.storage.session（session-state）から都度復元する。メモリ上のキャッシュは
// 消えても再構築可能なもの（解決結果・進行中 Promise）に限定する。

import * as sessionState from "../lib/session-state.js";
import * as cache from "../lib/cache.js";
import * as contentType from "../lib/content-type.js";
import * as pathResolver from "../lib/path-resolver.js";
import { LARGE_FILE_THRESHOLD } from "../lib/cache.js";
import {
  DriveAuthError,
  DriveForbiddenError,
  getFileMeta,
  getMediaRaw,
  listFolderFiles,
} from "../lib/drive-api.js";
import { getDemoFile } from "../lib/demo-content.js";
import { isMarkdown, renderMarkdown } from "../lib/markdown.js";
import { isRequestMessage, type StartPreviewResponse } from "../types/message.js";
import { ensureToken, isSignedIn } from "../lib/auth.js";
import { DEMO_ROOT, type PreviewSession } from "../types/preview.js";
import { DRIVE_FOLDER_MIME } from "../types/drive.js";

// Service Worker のグローバルスコープ（DOM lib と併用のため明示的にキャスト）
const sw = self as unknown as ServiceWorkerGlobalScope;

// ---- preview URL のパース -------------------------------------------------

const PREVIEW_PREFIX = chrome.runtime.getURL("preview/");

interface ParsedPreviewUrl {
  sessionId: string;
  relativePath: string;
}

/** この URL が preview 配下か。 */
function isPreviewUrl(url: string): boolean {
  return url.startsWith(PREVIEW_PREFIX);
}

/** preview/<sessionId>/<relativePath> を分解する。 */
function parsePreviewUrl(url: string): ParsedPreviewUrl | null {
  if (!isPreviewUrl(url)) return null;
  const rest = url.slice(PREVIEW_PREFIX.length); // "<sessionId>/<...>"
  const slash = rest.indexOf("/");
  if (slash < 0) {
    // preview/<sessionId> のみ → エントリ（index.html 相当）
    return { sessionId: rest, relativePath: "" };
  }
  return {
    sessionId: rest.slice(0, slash),
    relativePath: decodeURIComponent(rest.slice(slash + 1)),
  };
}

// ---- パス解決のメモ化 + in-flight 重複排除（docs/PERFORMANCE.md）----------

const RESOLVE_CACHE_LIMIT = 500;
/** sessionId\0relativePath → 解決結果（メモリ上・上限つき） */
const resolveCache = new Map<string, pathResolver.ResolvedFile>();
/** 進行中の解決 Promise（同一キーの重複 API 呼び出しを防ぐ） */
const resolving = new Map<string, Promise<pathResolver.ResolvedFile | null>>();

function setBounded<V>(map: Map<string, V>, key: string, value: V, limit: number): void {
  if (map.size >= limit) {
    const oldest = map.keys().next().value as string | undefined;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, value);
}

async function resolvePathCached(
  session: PreviewSession,
  relativePath: string,
): Promise<pathResolver.ResolvedFile | null> {
  const key = `${session.sessionId}\0${relativePath}`;
  const cached = resolveCache.get(key);
  if (cached) return cached;

  let pending = resolving.get(key);
  if (!pending) {
    pending = pathResolver
      .resolve(session.rootFolderId, relativePath)
      .finally(() => resolving.delete(key));
    resolving.set(key, pending);
  }

  const result = await pending;
  if (result) setBounded(resolveCache, key, result, RESOLVE_CACHE_LIMIT);
  return result;
}

// ---- エラー応答 -----------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function errorResponse(status: number, message: string, detail?: string): Response {
  const detailHtml = detail
    ? `<pre style="white-space:pre-wrap;background:#f5f5f5;padding:1rem;border-radius:8px;font-size:12px;color:#666;overflow:auto">${escapeHtml(detail)}</pre>`
    : "";
  const body = `<!doctype html><html lang="ja"><meta charset="utf-8">
<title>DriveWebPreviewer</title>
<body style="font-family:sans-serif;padding:2rem;color:#333">
<h1>${status}</h1><p>${message}</p>
${detailHtml}
<p>Drive のファイルを選び直して、もう一度プレビューを実行してください。</p>
</body></html>`;
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// ---- 配信元: デモ ---------------------------------------------------------

function serveFromDemo(relativePath: string): Response {
  const content = getDemoFile(relativePath);
  if (content === null) {
    return errorResponse(404, `デモにファイルがありません: ${relativePath}`);
  }
  const type = contentType.resolve(relativePath);
  return new Response(content, { headers: { "Content-Type": type } });
}

// ---- 配信元: Drive --------------------------------------------------------

async function serveFromDrive(
  session: PreviewSession,
  relativePath: string,
  rangeHeader: string | null,
): Promise<Response> {
  const resolved = await resolvePathCached(session, relativePath);
  if (!resolved) return errorResponse(404, `ファイルが見つかりません: ${relativePath}`);

  // Markdown はサーバー側で HTML に変換して表示する
  if (isMarkdown(relativePath)) {
    const mdRes = await getMediaRaw(resolved.fileId);
    const md = await mdRes.text();
    const html = await renderMarkdown(md, relativePath.split("/").pop() ?? relativePath);
    const response = new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
    await cache.put(session.sessionId, relativePath, response.clone());
    return response;
  }

  const driveRes = await getMediaRaw(resolved.fileId, rangeHeader);
  const type = contentType.resolve(relativePath, resolved.mimeType);

  // Range 応答（206）: 部分応答はそのまま透過し、キャッシュしない。
  if (rangeHeader && driveRes.status === 206) {
    const headers = new Headers({ "Content-Type": type, "Accept-Ranges": "bytes" });
    const contentRange = driveRes.headers.get("Content-Range");
    if (contentRange) headers.set("Content-Range", contentRange);
    const len = driveRes.headers.get("Content-Length");
    if (len) headers.set("Content-Length", len);
    return new Response(driveRes.body, { status: 206, headers });
  }

  // 大ファイル: body をストリーミング透過し、メモリ展開・キャッシュを避ける。
  const lengthHeader = driveRes.headers.get("Content-Length");
  const length = lengthHeader ? Number(lengthHeader) : NaN;
  if (Number.isFinite(length) && length > LARGE_FILE_THRESHOLD) {
    const headers = new Headers({ "Content-Type": type, "Accept-Ranges": "bytes" });
    headers.set("Content-Length", lengthHeader as string);
    return new Response(driveRes.body, { headers });
  }

  // 小ファイル: バッファ化してキャッシュ。
  const bytes = await driveRes.arrayBuffer();
  const response = new Response(bytes, {
    headers: { "Content-Type": type, "Accept-Ranges": "bytes" },
  });
  await cache.put(session.sessionId, relativePath, response.clone());
  return response;
}

// ---- リクエスト処理 -------------------------------------------------------

async function handlePreviewRequest(request: Request): Promise<Response> {
  const parsed = parsePreviewUrl(request.url);
  if (!parsed) return errorResponse(404, "不正なプレビュー URL です。");

  const { sessionId } = parsed;
  const relativePath = parsed.relativePath === "" ? "index.html" : parsed.relativePath;

  const session = await sessionState.load(sessionId);
  if (!session) {
    return errorResponse(404, "プレビューセッションが見つかりません（期限切れの可能性）。");
  }

  const rangeHeader = request.headers.get("Range");

  // Range 以外はキャッシュ参照（Range は部分応答のため都度取得）
  if (!rangeHeader) {
    const cached = await cache.match(sessionId, relativePath);
    if (cached) return cached;
  }

  try {
    if (session.source === "demo") {
      return serveFromDemo(relativePath);
    }
    return await serveFromDrive(session, relativePath, rangeHeader);
  } catch (err) {
    console.error("[preview] failed:", err);
    const detail = err instanceof Error ? err.message : String(err);
    if (err instanceof DriveAuthError) {
      return errorResponse(401, "Google の認証が切れています。再度サインインしてください。", detail);
    }
    if (err instanceof DriveForbiddenError) {
      return errorResponse(
        403,
        "Drive へのアクセスが拒否されました（API 未有効化・スコープ不足・権限なしのいずれか）。",
        detail,
      );
    }
    return errorResponse(502, "Drive からの取得に失敗しました。", detail);
  }
}

// ---- fetch インターセプト（トップレベルで同期登録）------------------------

sw.addEventListener("fetch", (event: FetchEvent) => {
  if (!isPreviewUrl(event.request.url)) return; // preview 以外は素通し
  event.respondWith(handlePreviewRequest(event.request));
});

// ---- メッセージ受信（トップレベルで同期登録）------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isRequestMessage(message)) return false;

  switch (message.type) {
    case "start_preview": {
      // ユーザー操作起点なので、未サインインならここで同意画面を出す（押す→同意→表示）。
      void ensureToken()
        .then(() => resolveDriveTarget(message))
        .then((init) => openPreviewTab(init))
        .then((res) => sendResponse(res))
        .catch((err) =>
          sendResponse({
            ok: false,
            error: `サインインまたはプレビューに失敗しました: ${String(err)}`,
          } satisfies StartPreviewResponse),
        );
      return true; // 非同期応答
    }
    case "start_demo": {
      void openPreviewTab({
        source: "demo",
        rootFolderId: DEMO_ROOT,
        entryFileName: "index.html",
      })
        .then((res) => sendResponse(res))
        .catch((err) =>
          sendResponse({ ok: false, error: String(err) } satisfies StartPreviewResponse),
        );
      return true;
    }
    case "get_auth_state": {
      void isSignedIn().then((signedIn) => sendResponse({ signedIn }));
      return true;
    }
    case "sign_in": {
      void isSignedIn().then((signedIn) => sendResponse({ signedIn }));
      return true;
    }
    default:
      return false;
  }
});

/**
 * start_preview メッセージから、配信元・ルートフォルダ・エントリ名を確定する。
 * 優先順位：
 * 1. fileId がある（特定ファイルを開いている／選択している）→ そのファイル 1 つをエントリにする。
 *    親フォルダ・ファイル名は Drive API（files.get の parents/name）で逆引きし、相対パスは
 *    そのファイルの親フォルダ基準で解決する。
 * 2. fileId が無く parentId のみ（フォルダを開いている）→ index.html をエントリにする。
 */
async function resolveDriveTarget(
  message: { fileId: string; parentId: string; fileName: string },
): Promise<Pick<PreviewSession, "source" | "rootFolderId" | "entryFileName">> {
  // 1. ID 指定がある場合（ファイルを開く／フォルダ・ファイルを選択）
  if (message.fileId) {
    const meta = await getFileMeta(message.fileId);

    // フォルダが選ばれた → そのフォルダをルートに index.html → html → md → txt で判定
    if (meta.mimeType === DRIVE_FOLDER_MIME) {
      const entryFileName = await pickFolderEntry(message.fileId);
      return { source: "drive", rootFolderId: message.fileId, entryFileName };
    }

    // ファイルが選ばれた → そのファイル単体（index.html 以外でも）
    const rootFolderId = meta.parents[0] ?? message.parentId;
    if (!rootFolderId) {
      throw new Error("親フォルダを特定できませんでした（共有や階層を確認してください）。");
    }
    return { source: "drive", rootFolderId, entryFileName: meta.name };
  }

  // 2. フォルダを開いている（URL の folderId のみ）→ エントリを自動判定
  if (message.parentId) {
    const entryFileName = message.fileName || (await pickFolderEntry(message.parentId));
    return { source: "drive", rootFolderId: message.parentId, entryFileName };
  }

  throw new Error("プレビュー対象を特定できませんでした。");
}

/**
 * フォルダのエントリファイル名を決める。
 * 1. index.html があればそれ
 * 2. 無ければ html → md → txt の順で、名前順の最初のファイル
 * 該当が無ければエラー。
 */
async function pickFolderEntry(folderId: string): Promise<string> {
  const files = await listFolderFiles(folderId);
  const lower = (name: string) => name.toLowerCase();

  const index = files.find((f) => lower(f.name) === "index.html");
  if (index) return index.name;

  const firstWith = (exts: string[]) =>
    files.find((f) => exts.some((ext) => lower(f.name).endsWith(ext)));

  const entry =
    firstWith([".html", ".htm"]) ??
    firstWith([".md", ".markdown"]) ??
    firstWith([".txt"]);

  if (!entry) {
    throw new Error("表示できるファイル（html / md / txt）がフォルダ内に見つかりません。");
  }
  return entry.name;
}

/** プレビューセッションを生成し、専用タブを開く。 */
async function openPreviewTab(
  init: Pick<PreviewSession, "source" | "rootFolderId" | "entryFileName">,
): Promise<StartPreviewResponse> {
  const session: PreviewSession = {
    sessionId: crypto.randomUUID(),
    createdAt: Date.now(),
    ...init,
  };
  await sessionState.save(session);

  const url = chrome.runtime.getURL(
    `preview/${session.sessionId}/${encodeURIComponent(session.entryFileName)}`,
  );
  await chrome.tabs.create({ url });
  return { ok: true };
}
