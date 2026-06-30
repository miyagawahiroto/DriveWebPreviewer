// HTML 全インライン化（docs/SANDBOX_PREVIEW.md 3.5）
// 相対参照（CSS/JS/画像/CSS url()）を取得して HTML に埋め込み、自己完結 HTML にする。
// 成功すればサンドボックス表示でインライン JS を動かせる。SW には DOMParser が無いため
// 正規表現ベースで書き換える（厳密な HTML/CSS パーサではない割り切り）。

import { normalize } from "./path-resolver.js";

/** 取得結果。bytes は生バイト、contentType は data URI 用 MIME。 */
export interface FetchedResource {
  bytes: Uint8Array;
  contentType: string;
}

/** ルート基準パスを受け取り取得する関数（SW 側で Drive 解決＋取得を実装して渡す）。 */
export type ResourceFetcher = (rootPath: string) => Promise<FetchedResource | null>;

export interface InlineOptions {
  /** インライン化の累積バイト上限。超えると InlineSizeExceededError を投げる。 */
  maxTotalBytes?: number;
}

/** インライン化サイズが上限を超えたときに投げる（呼び出し側はフォールバックする）。 */
export class InlineSizeExceededError extends Error {
  constructor() {
    super("inline resources exceeded size budget");
    this.name = "InlineSizeExceededError";
  }
}

// インライン化する取得リソースの raw 合計上限（デフォルト）。
// 注: data URI 化で base64 により約 +33%、さらに JSON 複製・ホストページ生成が重なるため、
// 実際の生成物・一時メモリはこの値を上回る。SW 側は LARGE_FILE_THRESHOLD を渡して
// エントリのサイズガードと基準を揃える（service-worker.ts）。
const DEFAULT_MAX_TOTAL_BYTES = 4 * 1024 * 1024; // 4MB（base64 後で約 5.3MB 相当）

// 相対参照か（html-analyze と同じ基準。絶対 URL / data: / blob: / # / スキーム付きは対象外）
function isRelativeRef(rawUrl: string): boolean {
  const url = rawUrl.trim();
  if (url === "") return false;
  if (url.startsWith("#")) return false;
  if (url.startsWith("//")) return false;
  if (url.startsWith("data:") || url.startsWith("blob:")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return false;
  return true;
}

/** ルート基準パスのうちディレクトリ部（末尾 "/" 付き、ルート直下なら ""）。 */
function dirOf(rootPath: string): string {
  const slash = rootPath.lastIndexOf("/");
  return slash < 0 ? "" : rootPath.slice(0, slash + 1);
}

/** baseDir（末尾 / 付き or ""）と相対 ref を、ルート基準の正規化パスへ。失敗で null。 */
function joinPath(baseDir: string, ref: string): string | null {
  const cleaned = ref.split("?")[0].split("#")[0];
  // ルート絶対参照（/foo）は baseDir を無視
  const combined = cleaned.startsWith("/") ? cleaned : baseDir + cleaned;
  const segs = normalize(combined);
  return segs ? segs.join("/") : null;
}

/** Uint8Array → data URI（base64）。 */
function toDataUri(bytes: Uint8Array, contentType: string): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const mime = contentType || "application/octet-stream";
  return `data:${mime};base64,${btoa(binary)}`;
}

const decoder = new TextDecoder("utf-8");

/** 累積サイズを管理しつつ取得する。上限超過で例外。 */
class Budget {
  private used = 0;
  constructor(private readonly max: number) {}
  add(n: number): void {
    this.used += n;
    if (this.used > this.max) throw new InlineSizeExceededError();
  }
}

/** 正規表現マッチを順に非同期置換する。 */
async function replaceAsync(
  input: string,
  regex: RegExp,
  replacer: (match: RegExpExecArray) => Promise<string>,
): Promise<string> {
  const matches: RegExpExecArray[] = [];
  regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(input)) !== null) {
    matches.push(m);
    if (m[0] === "") regex.lastIndex++; // 空マッチの無限ループ防止
  }
  let out = "";
  let last = 0;
  for (const mm of matches) {
    out += input.slice(last, mm.index);
    out += await replacer(mm);
    last = mm.index + mm[0].length;
  }
  out += input.slice(last);
  return out;
}

// CSS 内 url(...) と @import
const CSS_URL = /url\(\s*(["']?)([^"')]+)\1\s*\)/gi;
const CSS_IMPORT = /@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?\s*;?/gi;

/** CSS テキスト内の url() / @import を、その CSS の位置基準でインライン化する。 */
async function inlineCss(
  css: string,
  cssDir: string,
  fetcher: ResourceFetcher,
  budget: Budget,
): Promise<string> {
  // @import を取り込んだ CSS テキストで置換（再帰）
  const afterImport = await replaceAsync(css, CSS_IMPORT, async (m) => {
    const ref = m[1];
    if (!isRelativeRef(ref)) return m[0];
    const rootPath = joinPath(cssDir, ref);
    if (!rootPath) return m[0];
    const res = await fetcher(rootPath);
    if (!res) return m[0];
    budget.add(res.bytes.length);
    const importedDir = dirOf(rootPath);
    return await inlineCss(decoder.decode(res.bytes), importedDir, fetcher, budget);
  });
  // url() を data URI 化
  return await replaceAsync(afterImport, CSS_URL, async (m) => {
    const ref = m[2];
    if (!isRelativeRef(ref)) return m[0];
    const rootPath = joinPath(cssDir, ref);
    if (!rootPath) return m[0];
    const res = await fetcher(rootPath);
    if (!res) return m[0];
    budget.add(res.bytes.length);
    return `url("${toDataUri(res.bytes, res.contentType)}")`;
  });
}

// タグの属性値を pre(group1) + 値（"…"=group2 / '…'=group3 / 無クオート=group4）で取る。
// 後方参照を避ける（前置グループと衝突するため）。
function buildTagPattern(tag: string, attr: string): RegExp {
  return new RegExp(
    `(<${tag}\\b[^>]*?\\b${attr}\\s*=\\s*)(?:"([^"]*)"|'([^']*)'|([^"'=<>\\s\`]+))`,
    "gi",
  );
}

/**
 * HTML の相対サブリソース参照を取得してインライン化する。
 * 完全に取り込めれば「自己完結 HTML」になりサンドボックス表示できる。
 * ESM（type="module"）はあえて残す（不透明オリジンで import が解決できないため）。
 */
export async function inlineHtmlResources(
  html: string,
  entryPath: string,
  fetcher: ResourceFetcher,
  options: InlineOptions = {},
): Promise<string> {
  const budget = new Budget(options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES);
  const baseDir = dirOf(entryPath);
  let result = html;

  // 1) 元の HTML 内のインライン <style> の url() / @import を先に処理する（基準はエントリ位置）。
  //    後続の <link>→<style> 展開分（既にインライン化済み）を再走査しないよう、先頭で行う。
  result = await replaceAsync(result, /<style\b[^>]*>([\s\S]*?)<\/style>/gi, async (m) => {
    const inlined = await inlineCss(m[1], baseDir, fetcher, budget);
    return m[0].replace(m[1], inlined);
  });

  // 2) <link> … stylesheet は <style> に展開、それ以外の相対 href は data URI。
  //    href 値はクオート内のスペース（"my style.css" 等。Drive のファイル名で頻出）も拾う。
  result = await replaceAsync(
    result,
    /<link\b[^>]*?>/gi,
    async (m) => {
      const tag = m[0];
      const hrefMatch = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^"'=<>\s`]+))/i.exec(tag);
      if (!hrefMatch) return tag;
      const ref = hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3] ?? "";
      if (!isRelativeRef(ref)) return tag;
      const rootPath = joinPath(baseDir, ref);
      if (!rootPath) return tag;
      const res = await fetcher(rootPath);
      if (!res) return tag;
      const isStylesheet = /\brel\s*=\s*(["']?)[^"'>]*stylesheet[^"'>]*\1/i.test(tag);
      if (isStylesheet) {
        budget.add(res.bytes.length);
        const css = await inlineCss(decoder.decode(res.bytes), dirOf(rootPath), fetcher, budget);
        // CSS 内に文字列 </style> があると style ブロックが早期終了するためエスケープ
        // （<script> 取込の </script> エスケープと対称）。CSS 的には \/ は / にデコードされ無害。
        return `<style>${css.replace(/<\/style>/gi, "<\\/style>")}</style>`;
      }
      budget.add(res.bytes.length);
      const dataUri = toDataUri(res.bytes, res.contentType);
      return tag.replace(hrefMatch[0], `href="${dataUri}"`);
    },
  );

  // 3) <script src> … 非 module のみ JS を取り込む（module は残してフォールバックさせる）。
  //    src 値もクオート内のスペースを許容する三択にする。
  result = await replaceAsync(
    result,
    /<script\b([^>]*?)\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^"'=<>\s`]+))([^>]*)><\/script>/gi,
    async (m) => {
      const ref = m[2] ?? m[3] ?? m[4] ?? "";
      const attrs = m[1] + " " + m[5];
      if (/\btype\s*=\s*(["']?)module\1/i.test(attrs)) return m[0]; // ESM は残す
      if (!isRelativeRef(ref)) return m[0];
      const rootPath = joinPath(baseDir, ref);
      if (!rootPath) return m[0];
      const res = await fetcher(rootPath);
      if (!res) return m[0];
      budget.add(res.bytes.length);
      // </script> がスクリプト内にあると早期終了するためエスケープ
      const js = decoder.decode(res.bytes).replace(/<\/script>/gi, "<\\/script>");
      return `<script>${js}</script>`;
    },
  );

  // 4) メディア系の相対 src / data を data URI 化
  const inlineMediaAttr = async (m: RegExpExecArray): Promise<string> => {
    const pre = m[1];
    const ref = m[2] ?? m[3] ?? m[4] ?? "";
    if (!isRelativeRef(ref)) return m[0];
    const rootPath = joinPath(baseDir, ref);
    if (!rootPath) return m[0];
    const res = await fetcher(rootPath);
    if (!res) return m[0];
    budget.add(res.bytes.length);
    return `${pre}"${toDataUri(res.bytes, res.contentType)}"`;
  };
  for (const tag of ["img", "source", "video", "audio", "embed"]) {
    result = await replaceAsync(result, buildTagPattern(tag, "src"), inlineMediaAttr);
  }
  result = await replaceAsync(result, buildTagPattern("object", "data"), inlineMediaAttr);

  // 注: srcset は意図的にインライン化しない。data URI はカンマを含むため srcset の
  // カンマ区切り構文と衝突し、安全に書き換えできない。相対 srcset を持つページは
  // hasRelativeSubresource が検知して従来表示にフォールバックする（docs/SANDBOX_PREVIEW.md）。

  return result;
}
