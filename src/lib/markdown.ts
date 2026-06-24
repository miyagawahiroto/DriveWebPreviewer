// Markdown → HTML 変換（.md / .markdown のプレビュー用）
// marked をバンドルして使う（リモートコードではないので MV3 制約に抵触しない）。

import { marked } from "marked";

/** パスが Markdown ファイルか判定する。 */
export function isMarkdown(path: string): boolean {
  const clean = path.split("?")[0].split("#")[0];
  return /\.(md|markdown)$/i.test(clean);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

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
`;

/**
 * Markdown テキストを、スタイル付き HTML ドキュメント文字列に変換する。
 * @param title ページタイトル（通常はファイル名）
 */
export async function renderMarkdown(md: string, title: string): Promise<string> {
  // marked.parse は同期/非同期どちらの戻り値もありうるため Promise.resolve で吸収する
  const inner = await Promise.resolve(marked.parse(md));
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style></head>
<body><article class="markdown-body">${inner}</article></body></html>`;
}
