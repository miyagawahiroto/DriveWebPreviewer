// Markdown → HTML 変換（.md / .markdown のプレビュー用）
// marked をバンドルして使う（リモートコードではないので MV3 制約に抵触しない）。
// Mermaid 記法（```mermaid）は図のプレースホルダ <pre class="mermaid"> に変換し、
// 実際の描画はプレビュータブ側の assets/mermaid-runtime.js が行う（docs/MERMAID.md）。

import { marked } from "marked";

/** パスが Markdown ファイルか判定する。 */
export function isMarkdown(path: string): boolean {
  const clean = path.split("?")[0].split("#")[0];
  return /\.(md|markdown)$/i.test(clean);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// mermaid プレースホルダの目印。スクリプト注入判定はこの文字列が変換後 HTML に
// 含まれるかで行い、レンダラの実出力と判定経路を一致させる（別ロジックの取りこぼし防止）。
const MERMAID_MARKER = 'class="mermaid"';

// marked のコードレンダラを差し替え、```mermaid を <pre class="mermaid"> に変換する。
// それ以外の言語は false を返して既定レンダラにフォールバックさせる。
// （marked は単一インスタンスのため、モジュール読み込み時に一度だけ設定する）
marked.use({
  renderer: {
    code(token: { text: string; lang?: string }) {
      const lang = (token.lang ?? "").trim().split(/\s+/)[0].toLowerCase();
      if (lang === "mermaid") {
        return `<pre ${MERMAID_MARKER}>${escapeHtml(token.text)}</pre>`;
      }
      return false;
    },
  },
});

const STYLE = `
:root { color-scheme: light; }
body {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  margin: 0;
  background: #fff;
  color: #1f2328;
  line-height: 1.65;
}
.markdown-body {
  max-width: 820px;
  margin: 0 auto;
  padding: 2.5rem 1.5rem 4rem;
}
.markdown-body h1, .markdown-body h2 {
  border-bottom: 1px solid #d0d7de;
  padding-bottom: .3em;
}
.markdown-body h1, .markdown-body h2, .markdown-body h3 { margin-top: 1.6em; }
.markdown-body code {
  background: #afb8c133;
  padding: .2em .4em;
  border-radius: 6px;
  font-size: 85%;
}
.markdown-body pre {
  background: #f6f8fa;
  padding: 1rem;
  border-radius: 8px;
  overflow: auto;
}
.markdown-body pre code { background: none; padding: 0; }
.markdown-body blockquote {
  margin: 0;
  padding: 0 1em;
  color: #59636e;
  border-left: .25em solid #d0d7de;
}
.markdown-body table { border-collapse: collapse; }
.markdown-body th, .markdown-body td { border: 1px solid #d0d7de; padding: 6px 13px; }
.markdown-body img { max-width: 100%; }
.markdown-body a { color: #0969da; }
/* Mermaid: 描画前はソース、描画後は SVG。枠を消して中央寄せにする。 */
.markdown-body pre.mermaid {
  background: none;
  padding: 0;
  text-align: center;
  overflow-x: auto;
}
.markdown-body pre.mermaid svg { max-width: 100%; height: auto; }
`;

/** renderMarkdown のオプション。 */
export interface RenderMarkdownOptions {
  /**
   * Mermaid 描画ランタイム（assets/mermaid-runtime.js）の絶対 URL。
   * SW 側で chrome.runtime.getURL("assets/mermaid-runtime.js") を解決して渡す。
   * 指定があり、かつ Markdown に mermaid ブロックが含まれる場合のみ <script> を注入する。
   */
  mermaidRuntimeUrl?: string;
}

/**
 * Markdown テキストを、スタイル付き HTML ドキュメント文字列に変換する。
 * @param title ページタイトル（通常はファイル名）
 * @param opts mermaid ランタイム URL など
 */
export async function renderMarkdown(
  md: string,
  title: string,
  opts: RenderMarkdownOptions = {},
): Promise<string> {
  // marked.parse は同期/非同期どちらの戻り値もありうるため Promise.resolve で吸収する
  const inner = await Promise.resolve(marked.parse(md));
  // 変換後 HTML に mermaid プレースホルダが実際に出力されたときだけ、重いランタイムを
  // 読み込む（docs/MERMAID.md 4）。レンダラの実出力で判定するため取りこぼし・無駄注入が無い。
  const mermaidScript =
    opts.mermaidRuntimeUrl && inner.includes(MERMAID_MARKER)
      ? `<script type="module" src="${escapeHtml(opts.mermaidRuntimeUrl)}"></script>`
      : "";
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style></head>
<body><article class="markdown-body">${inner}</article>${mermaidScript}</body></html>`;
}
