// 拡張子 / Drive mimeType → レスポンス Content-Type 解決
// マッピングは docs/CONTENT_TYPE.md を参照。

const EXTENSION_MAP: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  eot: "application/vnd.ms-fontobject",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  wasm: "application/wasm",
  pdf: "application/pdf",
};

const FALLBACK = "application/octet-stream";

/** パス末尾の拡張子（小文字・ドット無し）を返す。無ければ空文字。 */
function extensionOf(path: string): string {
  const base = path.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

/**
 * 相対パスと（あれば）Drive の mimeType から Content-Type を決定する。
 * 拡張子を最優先し、不明なら driveMimeType、最後に octet-stream。
 */
export function resolve(relativePath: string, driveMimeType?: string): string {
  const ext = extensionOf(relativePath);
  if (ext && EXTENSION_MAP[ext]) return EXTENSION_MAP[ext];
  if (driveMimeType && driveMimeType !== "application/octet-stream") {
    return driveMimeType;
  }
  return FALLBACK;
}
