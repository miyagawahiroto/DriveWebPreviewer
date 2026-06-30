// HTML 静的解析（docs/SANDBOX_PREVIEW.md）
// 「SW での解決が必要な相対サブリソース参照」を含むかを判定する。
// SW には DOMParser が無いため正規表現で解析する（厳密な HTML パーサではない割り切り）。

/**
 * URL 値が「相対パス」か（= SW が親フォルダ基準で解決すべき参照か）。
 * 絶対 URL（https:// / //host）・data: / blob: / フラグメント(#) / スキーム付き
 * （mailto: tel: javascript: 等）は相対ではない＝サブリソース解決を要しない。
 */
function isRelativeRef(rawUrl: string): boolean {
  const url = rawUrl.trim();
  if (url === "") return false;
  if (url.startsWith("#")) return false; // ページ内アンカー
  if (url.startsWith("//")) return false; // プロトコル相対（絶対扱い）
  if (url.startsWith("data:") || url.startsWith("blob:")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return false; // http: https: mailto: tel: javascript: 等
  return true; // style.css, js/app.js, ./x, ../x, /abs などは相対扱い
}

// 属性値（クオート付き = group1 / 無クオート = group2）。無クオートの取りこぼし
// （例: <img src=logo.png>）を誤って「自己完結」と判定しないよう両方を拾う。
const ATTR_VALUE = `(?:["']([^"']*)["']|([^\\s"'=<>\`]+))`;

/**
 * タグ別に属性値を抜き出して相対参照を探すための定義。
 * `<a href>` は対象外（ナビゲーションでありサブリソースではない）。
 */
const TAG_ATTR_PATTERNS: RegExp[] = [
  new RegExp(`<link\\b[^>]*?\\bhref\\s*=\\s*${ATTR_VALUE}`, "gi"),
  new RegExp(`<script\\b[^>]*?\\bsrc\\s*=\\s*${ATTR_VALUE}`, "gi"),
  new RegExp(`<img\\b[^>]*?\\bsrc\\s*=\\s*${ATTR_VALUE}`, "gi"),
  new RegExp(`<iframe\\b[^>]*?\\bsrc\\s*=\\s*${ATTR_VALUE}`, "gi"),
  new RegExp(`<source\\b[^>]*?\\bsrc\\s*=\\s*${ATTR_VALUE}`, "gi"),
  new RegExp(`<source\\b[^>]*?\\bsrcset\\s*=\\s*${ATTR_VALUE}`, "gi"),
  new RegExp(`<img\\b[^>]*?\\bsrcset\\s*=\\s*${ATTR_VALUE}`, "gi"),
  new RegExp(`<video\\b[^>]*?\\bsrc\\s*=\\s*${ATTR_VALUE}`, "gi"),
  new RegExp(`<audio\\b[^>]*?\\bsrc\\s*=\\s*${ATTR_VALUE}`, "gi"),
  new RegExp(`<embed\\b[^>]*?\\bsrc\\s*=\\s*${ATTR_VALUE}`, "gi"),
  new RegExp(`<object\\b[^>]*?\\bdata\\s*=\\s*${ATTR_VALUE}`, "gi"),
];

// CSS の url(...) と @import（<style> ブロックや style 属性内）
const CSS_URL_PATTERN = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
const CSS_IMPORT_PATTERN = /@import\s+["']([^"']+)["']/gi;

/** srcset 値（"a.jpg 1x, b.jpg 2x"）から URL 部分のみを取り出す。 */
function srcsetUrls(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter((u) => u !== "");
}

/**
 * HTML が「SW での解決が必要な相対サブリソース参照」を 1 つでも含むか。
 * true: 複数ファイル構成（従来どおり拡張ページで SW 解決）
 * false: 1 ファイルで完結（サンドボックス表示の候補）
 */
export function hasRelativeSubresource(html: string): boolean {
  for (const pattern of TAG_ATTR_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(html)) !== null) {
      const value = m[1] ?? m[2] ?? ""; // クオート付き or 無クオート
      // srcset は複数 URL を含むので分解して判定
      const urls = /\bsrcset\s*=/i.test(m[0]) ? srcsetUrls(value) : [value];
      if (urls.some(isRelativeRef)) return true;
    }
  }
  for (const pattern of [CSS_URL_PATTERN, CSS_IMPORT_PATTERN]) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(html)) !== null) {
      if (isRelativeRef(m[1])) return true;
    }
  }
  return false;
}
