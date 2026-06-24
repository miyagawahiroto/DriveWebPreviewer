// 相対パス → Drive 上の fileId 解決
// アルゴリズムは docs/PATH_RESOLUTION.md を参照。

import { findFile, findFolder } from "./drive-api.js";

/** パス解決の結果。フォルダ階層を辿って末尾ファイルの ID を得る。 */
export interface ResolvedFile {
  fileId: string;
  mimeType: string;
}

/**
 * 相対パスを正規化し、セグメント配列にする。
 * - クエリ・ハッシュ除去、先頭 / 除去
 * - 末尾が "/" または空なら index.html を補う
 * - "." を除去し ".." で 1 つ上る（ルート超過は null）
 */
export function normalize(relativePath: string): string[] | null {
  let path = relativePath.split("?")[0].split("#")[0];
  path = path.replace(/^\/+/, "");
  if (path === "" || path.endsWith("/")) path += "index.html";

  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length === 0) return null; // ルート超過
      out.pop();
      continue;
    }
    out.push(seg);
  }
  if (out.length === 0) return null;
  return out;
}

/**
 * rootFolderId を起点に相対パスを辿り、末尾ファイルの ID / mimeType を返す。
 * 途中のフォルダまたはファイルが見つからなければ null。
 */
export async function resolve(
  rootFolderId: string,
  relativePath: string,
): Promise<ResolvedFile | null> {
  const segments = normalize(relativePath);
  if (!segments) return null;

  const fileName = segments[segments.length - 1];
  const folderNames = segments.slice(0, -1);

  let currentFolderId = rootFolderId;
  for (const folderName of folderNames) {
    const folder = await findFolder(currentFolderId, folderName);
    if (!folder) return null;
    currentFolderId = folder.id;
  }

  const file = await findFile(currentFolderId, fileName);
  if (!file) return null;
  return { fileId: file.id, mimeType: file.mimeType };
}
