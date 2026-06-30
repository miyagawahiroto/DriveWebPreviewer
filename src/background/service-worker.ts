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
import { hasRelativeSubresource } from "../lib/html-analyze.js";
import {
  inlineHtmlResources,
  type ResourceFetcher,
} from "../lib/inline-resources.js";
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

// ---- サンドボックス表示（自己完結 HTML 用）-------------------------------
// docs/SANDBOX_PREVIEW.md。外部参照を持たない HTML はサンドボックスで表示し、
// インライン <script> / onclick / eval を動かす。

/** HTML が text/html か（charset 等のパラメータ付きでも判定）。 */
function isHtmlType(type: string): boolean {
  return type.toLowerCase().startsWith("text/html");
}

/**
 * 自己完結 HTML を描画するホストページを生成する。
 * 元 HTML を JSON 文字列として安全に埋め込み（`<` をエスケープして </script> 注入を防ぐ）、
 * サンドボックス iframe（緩い CSP）へ preview-host.js が postMessage で渡して描画させる。
 */
function buildSandboxHostPage(docHtml: string): string {
  // JSON.stringify 後に "<" を "<" に置換して、埋め込み <script> の早期終了/注入を防ぐ
  const embedded = JSON.stringify(docHtml).replace(/</g, "\\u003c");
  const sandboxUrl = chrome.runtime.getURL("sandbox.html");
  const hostScriptUrl = chrome.runtime.getURL("assets/preview-host.js");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DriveWebPreviewer</title>
<style>html,body{margin:0;height:100%}#dwp-frame{border:0;display:block;width:100%;height:100vh}</style>
</head><body>
<script type="application/json" id="dwp-doc">${embedded}</script>
<iframe id="dwp-frame" src="${sandboxUrl}"></iframe>
<script type="module" src="${hostScriptUrl}"></script>
</body></html>`;
}

/** ルート基準パスを Drive 解決＋取得する ResourceFetcher を作る（インライン化用）。 */
function makeResourceFetcher(session: PreviewSession): ResourceFetcher {
  return async (rootPath) => {
    const resolved = await resolvePathCached(session, rootPath);
    if (!resolved) return null;
    const res = await getMediaRaw(resolved.fileId);
    const buf = await res.arrayBuffer();
    return {
      bytes: new Uint8Array(buf),
      contentType: contentType.resolve(rootPath, resolved.mimeType),
    };
  };
}

/**
 * エントリ HTML を、構成に応じてサンドボックス or 従来表示の Response にする。
 * - 相対参照なし（1 ファイル完結）→ そのままサンドボックス（docs/SANDBOX_PREVIEW.md 2）
 * - 相対参照あり → 全インライン化を試み、完全に取り込めればサンドボックス（同 3.5）。
 *   取り込めない（取得失敗・ESM 残存・サイズ超過）→ 従来表示にフォールバック（SW が解決）。
 */
async function wrapHtmlForPreview(
  html: string,
  session: PreviewSession,
  entryPath: string,
): Promise<Response> {
  let body: string;
  if (!hasRelativeSubresource(html)) {
    body = buildSandboxHostPage(html);
  } else {
    let inlined: string | null = null;
    try {
      // バジェットはエントリのサイズガード（LARGE_FILE_THRESHOLD）と基準を揃える
      inlined = await inlineHtmlResources(html, entryPath, makeResourceFetcher(session), {
        maxTotalBytes: LARGE_FILE_THRESHOLD,
      });
    } catch (err) {
      // 認証/権限エラーは握りつぶさず外側ハンドラの 401/403 メッセージに委ねる
      if (err instanceof DriveAuthError || err instanceof DriveForbiddenError) throw err;
      // サイズ超過・パース失敗等はインライン化を諦める（従来表示へフォールバック）
      console.warn("[preview] inline failed, fallback to plain:", err);
      inlined = null;
    }
    body = inlined !== null && !hasRelativeSubresource(inlined)
      ? buildSandboxHostPage(inlined)
      : html;
  }
  return new Response(body, {
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
  isNavigate: boolean,
): Promise<Response> {
  const resolved = await resolvePathCached(session, relativePath);
  if (!resolved) return errorResponse(404, `ファイルが見つかりません: ${relativePath}`);

  // Markdown はサーバー側で HTML に変換して表示する
  if (isMarkdown(relativePath)) {
    const mdRes = await getMediaRaw(resolved.fileId);
    const md = await mdRes.text();
    // Mermaid 描画ランタイムは preview/ 配下を避け assets/ から配信する（docs/MERMAID.md）
    const mermaidRuntimeUrl = chrome.runtime.getURL("assets/mermaid-runtime.js");
    const html = await renderMarkdown(md, relativePath.split("/").pop() ?? relativePath, {
      mermaidRuntimeUrl,
    });
    const response = new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
    await cache.put(session.sessionId, relativePath, response.clone());
    return response;
  }

  const driveRes = await getMediaRaw(resolved.fileId, rangeHeader);
  const type = contentType.resolve(relativePath, resolved.mimeType);

  // エントリ HTML（ナビゲーション）は、外部参照が無ければサンドボックスで表示し
  // インライン JS を動かす（docs/SANDBOX_PREVIEW.md）。Range 要求時は対象外。
  // 注意: キャッシュキーは (sessionId, relativePath) のみで navigate を区別しない。
  // エントリは最初に navigate で取得される前提（サンドボックス内は不透明オリジンのため
  // 後続の再要求が SW に届かない）ので、raw が先にキャッシュされてラップ漏れする不整合は
  // 実運用では起きない。前提が崩れたらキーに navigate を含める必要がある。
  if (isNavigate && !rangeHeader && isHtmlType(type)) {
    // 巨大な自己完結 HTML（data URI を多用したページ等）は全文バッファ＋JSON 複製＋
    // ホストページ生成でメモリを数倍に展開してしまう。Content-Length が閾値超なら
    // サンドボックス化せず、下の通常/ストリーミング配信に委ねる（インライン JS は
    // 動かないが安全側のフォールバック）。Content-Length 不明時はバッファして扱う。
    const lengthHeader = driveRes.headers.get("Content-Length");
    const length = lengthHeader ? Number(lengthHeader) : NaN;
    if (!(Number.isFinite(length) && length > LARGE_FILE_THRESHOLD)) {
      const html = await driveRes.text();
      const response = await wrapHtmlForPreview(html, session, relativePath);
      await cache.put(session.sessionId, relativePath, response.clone());
      return response;
    }
    // 閾値超過 → 以降の通常配信パスへフォールスルー（driveRes.body は未消費）
  }

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
  // トップレベルのドキュメント遷移か（サンドボックス出し分けの対象判定に使う）
  const isNavigate = request.mode === "navigate";

  // Range 以外はキャッシュ参照（Range は部分応答のため都度取得）
  if (!rangeHeader) {
    const cached = await cache.match(sessionId, relativePath);
    if (cached) return cached;
  }

  try {
    if (session.source === "demo") {
      return serveFromDemo(relativePath);
    }
    return await serveFromDrive(session, relativePath, rangeHeader, isNavigate);
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
      // 「Web プレビュー」起点（ユーザー操作）。未サインインなら初回のみ同意を出す（押す→同意→表示）。
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
    if (files.length === 0) {
      throw new Error(
        "フォルダ直下にファイルが見つかりません（空、サブフォルダの中、または共有/権限の可能性）。" +
          "index.html はフォルダ直下に置いてください。",
      );
    }
    const names = files.map((f) => f.name).slice(0, 8).join(", ");
    throw new Error(
      `フォルダ内に html / md / txt が見つかりません（${files.length} 件: ${names}）。`,
    );
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
