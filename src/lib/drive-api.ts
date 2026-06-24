// Google Drive API v3 クライアント
// 仕様は docs/DRIVE_API.md を参照。

import { getToken, invalidate } from "./auth.js";
import {
  DRIVE_FOLDER_MIME,
  type DriveFile,
  type DriveListResponse,
  type DriveMedia,
} from "../types/drive.js";

export const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

/** Drive API 呼び出しで認証エラー時に投げる。Service Worker 側で 401 に変換する。 */
export class DriveAuthError extends Error {}
/** 権限エラー（403）。 */
export class DriveForbiddenError extends Error {}
/** その他のサーバー / ネットワーク障害。 */
export class DriveServerError extends Error {}

/** files.list クエリ内のシングルクォートをエスケープする。 */
function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * 認証付きで Drive API を叩く。401 のときはトークンを失効させ 1 度だけ再試行する。
 * @param extraHeaders Range など追加ヘッダ
 */
async function authedFetch(
  url: string,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const build = (token: string): RequestInit => ({
    headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
  });

  let token = await getToken(false);
  let res = await fetch(url, build(token));

  if (res.status === 401) {
    await invalidate(token);
    token = await getToken(false);
    res = await fetch(url, build(token));
  }

  if (res.status === 401) throw new DriveAuthError("unauthorized");
  if (res.status === 403) {
    const detail = await res.text().catch(() => "");
    throw new DriveForbiddenError(detail.slice(0, 600) || "forbidden");
  }
  if (res.status >= 500) {
    const detail = await res.text().catch(() => "");
    throw new DriveServerError(`drive api ${res.status}: ${detail.slice(0, 400)}`);
  }
  return res;
}

/**
 * 指定フォルダ直下の、名前が一致する項目を検索し、更新日時が最新のものを返す。
 * @param extraMime フォルダのみに絞る場合などに mimeType 条件を付ける
 */
async function findByName(
  parentFolderId: string,
  name: string,
  extraMime?: string,
): Promise<DriveFile | null> {
  const clauses = [
    `'${escapeQueryValue(parentFolderId)}' in parents`,
    `name = '${escapeQueryValue(name)}'`,
    "trashed = false",
  ];
  if (extraMime) clauses.push(`mimeType = '${escapeQueryValue(extraMime)}'`);

  const params = new URLSearchParams({
    q: clauses.join(" and "),
    fields: "files(id,name,mimeType,modifiedTime,createdTime)",
    orderBy: "modifiedTime desc",
    pageSize: "10",
    spaces: "drive",
  });

  const res = await authedFetch(`${DRIVE_API_BASE}/files?${params.toString()}`);
  if (res.status === 404) return null;
  const data = (await res.json()) as DriveListResponse;
  const files = data.files ?? [];
  if (files.length === 0) return null;

  // orderBy=modifiedTime desc で先頭が最新。
  // 念のためクライアント側でも modifiedTime → createdTime の順で最新を選ぶ。
  return files.reduce((latest, current) =>
    isNewer(current, latest) ? current : latest,
  );
}

/** a が b より新しいか（modifiedTime → createdTime の順で比較）。 */
export function isNewer(a: DriveFile, b: DriveFile): boolean {
  const am = a.modifiedTime ?? a.createdTime ?? "";
  const bm = b.modifiedTime ?? b.createdTime ?? "";
  if (am !== bm) return am > bm;
  return (a.createdTime ?? "") > (b.createdTime ?? "");
}

/** 指定フォルダ直下のファイルを名前で検索する。 */
export function findFile(
  parentFolderId: string,
  name: string,
): Promise<DriveFile | null> {
  return findByName(parentFolderId, name);
}

/** 指定フォルダ直下のサブフォルダを名前で検索する。 */
export function findFolder(
  parentFolderId: string,
  folderName: string,
): Promise<DriveFile | null> {
  return findByName(parentFolderId, folderName, DRIVE_FOLDER_MIME);
}

/**
 * 指定フォルダ直下の（フォルダ以外の）ファイル一覧を名前順で取得する。
 * フォルダ選択時のエントリ自動判定に使う。
 */
export async function listFolderFiles(folderId: string): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    q: `'${escapeQueryValue(folderId)}' in parents and trashed = false and mimeType != '${DRIVE_FOLDER_MIME}'`,
    fields: "files(id,name,mimeType,modifiedTime,createdTime)",
    orderBy: "name",
    pageSize: "200",
    spaces: "drive",
  });
  const res = await authedFetch(`${DRIVE_API_BASE}/files?${params.toString()}`);
  if (res.status === 404) return [];
  const data = (await res.json()) as DriveListResponse;
  return data.files ?? [];
}

/**
 * ファイルのメタ情報（名前・親フォルダ）を取得する。
 * ファイルを開いた状態からプレビューする際に、親フォルダ ID とエントリ名を逆引きするのに使う。
 */
export async function getFileMeta(
  fileId: string,
): Promise<{ name: string; mimeType: string; parents: string[] }> {
  const params = new URLSearchParams({ fields: "id,name,mimeType,parents" });
  const res = await authedFetch(
    `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?${params.toString()}`,
  );
  const data = (await res.json()) as {
    name: string;
    mimeType: string;
    parents?: string[];
  };
  return { name: data.name, mimeType: data.mimeType, parents: data.parents ?? [] };
}

/**
 * ファイル本体の生レスポンスを取得する。
 * 呼び出し側がサイズに応じて arrayBuffer 化（小ファイル）か body 透過（大ファイル）を選ぶ。
 * @param rangeHeader 動画・音声のシーク用。指定すると 206 が返りうる。
 */
export function getMediaRaw(
  fileId: string,
  rangeHeader?: string | null,
): Promise<Response> {
  const extra = rangeHeader ? { Range: rangeHeader } : undefined;
  return authedFetch(
    `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`,
    extra,
  );
}

/** ファイル本体をすべてバイト列で取得する（小ファイル向けの簡易版）。 */
export async function getMedia(
  fileId: string,
  knownMimeType?: string,
): Promise<DriveMedia> {
  const res = await getMediaRaw(fileId);
  const bytes = await res.arrayBuffer();
  const mimeType =
    knownMimeType ??
    res.headers.get("Content-Type") ??
    "application/octet-stream";
  return { bytes, mimeType };
}
