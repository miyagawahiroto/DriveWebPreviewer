import { describe, expect, it } from "vitest";
import { isMarkdown, renderMarkdown } from "../src/lib/markdown.js";

const RUNTIME_URL = "chrome-extension://abc/assets/mermaid-runtime.js";

describe("isMarkdown", () => {
  it(".md / .markdown を Markdown と判定する（大文字・クエリ・ハッシュ込み）", () => {
    expect(isMarkdown("README.md")).toBe(true);
    expect(isMarkdown("docs/guide.markdown")).toBe(true);
    expect(isMarkdown("NOTES.MD")).toBe(true);
    expect(isMarkdown("a.md?x=1#h")).toBe(true);
  });

  it("Markdown 以外は false", () => {
    expect(isMarkdown("index.html")).toBe(false);
    expect(isMarkdown("style.css")).toBe(false);
    expect(isMarkdown("readme.txt")).toBe(false);
  });
});

describe("renderMarkdown - 基本変換", () => {
  it("本文を HTML 化し、タイトルを <title> に入れる", async () => {
    const html = await renderMarkdown("# 見出し\n\n本文", "sample.md");
    expect(html).toContain("<title>sample.md</title>");
    expect(html).toContain("<h1");
    expect(html).toContain("見出し");
    expect(html).toContain('<article class="markdown-body">');
  });

  it("タイトルの HTML 特殊文字をエスケープする", async () => {
    const html = await renderMarkdown("x", '<img src=x onerror="alert(1)">.md');
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img src=x");
  });
});

describe("renderMarkdown - mermaid 変換", () => {
  it("```mermaid を <pre class=\"mermaid\"> に変換する", async () => {
    const md = "```mermaid\nflowchart TD\n  A-->B\n```";
    const html = await renderMarkdown(md, "d.md");
    expect(html).toContain('<pre class="mermaid">');
    expect(html).toContain("flowchart TD");
    // 通常のコードブロック（<pre><code>）ではない
    expect(html).not.toContain("<code>flowchart TD");
  });

  it("mermaid ソース内の特殊文字をエスケープする", async () => {
    const md = "```mermaid\ngraph TD\n  A[<b> & </b>]\n```";
    const html = await renderMarkdown(md, "d.md");
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("&amp;");
  });

  it("mermaid 以外の言語は通常コードブロックのまま（pre.mermaid を出さない）", async () => {
    const md = "```js\nconst x = 1;\n```";
    const html = await renderMarkdown(md, "d.md");
    expect(html).not.toContain('class="mermaid"');
    expect(html).toContain("const x");
  });
});

describe("renderMarkdown - スクリプト注入判定（変換後 HTML で一元判定）", () => {
  it("mermaid ブロックがあり runtime URL 指定時はスクリプトを注入する", async () => {
    const md = "```mermaid\nflowchart TD\n  A-->B\n```";
    const html = await renderMarkdown(md, "d.md", { mermaidRuntimeUrl: RUNTIME_URL });
    expect(html).toContain(`<script type="module" src="${RUNTIME_URL}">`);
  });

  it("runtime URL 未指定なら、mermaid があってもスクリプトを注入しない", async () => {
    const md = "```mermaid\nflowchart TD\n  A-->B\n```";
    const html = await renderMarkdown(md, "d.md");
    expect(html).not.toContain("<script");
  });

  it("mermaid を含まない Markdown にはスクリプトを注入しない", async () => {
    const md = "# title\n\n```js\nconst x = 1;\n```";
    const html = await renderMarkdown(md, "d.md", { mermaidRuntimeUrl: RUNTIME_URL });
    expect(html).not.toContain("<script");
  });

  it("リテラル表示（インラインコード内の mermaid 文字列）では注入しない", async () => {
    // 図にはならない（pre.mermaid を出さない）ので無駄注入されないこと
    const md = "これは `mermaid` という単語の説明です。";
    const html = await renderMarkdown(md, "d.md", { mermaidRuntimeUrl: RUNTIME_URL });
    expect(html).not.toContain('class="mermaid"');
    expect(html).not.toContain("<script");
  });
});
