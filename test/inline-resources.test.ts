import { describe, expect, it } from "vitest";
import {
  inlineHtmlResources,
  InlineSizeExceededError,
  type ResourceFetcher,
} from "../src/lib/inline-resources.js";
import { hasRelativeSubresource } from "../src/lib/html-analyze.js";

/** 文字列 → FetchedResource を返す簡易フェッチャ。キーはルート基準パス。 */
function fetcherFrom(files: Record<string, { body: string; type: string }>): ResourceFetcher {
  return async (rootPath) => {
    const f = files[rootPath];
    if (!f) return null;
    return { bytes: new TextEncoder().encode(f.body), contentType: f.type };
  };
}

describe("inlineHtmlResources", () => {
  it("相対 CSS を <style> に展開する", async () => {
    const html = '<link rel="stylesheet" href="style.css"><h1>hi</h1>';
    const out = await inlineHtmlResources(
      html,
      "index.html",
      fetcherFrom({ "style.css": { body: "h1{color:red}", type: "text/css" } }),
    );
    expect(out).toContain("<style>h1{color:red}</style>");
    expect(out).not.toContain("<link");
    expect(hasRelativeSubresource(out)).toBe(false); // 完全に取り込めた
  });

  it("相対 JS を <script> に展開し </script> をエスケープする", async () => {
    const html = '<script src="app.js"></script>';
    const out = await inlineHtmlResources(
      html,
      "index.html",
      fetcherFrom({ "app.js": { body: 'console.log("</script>")', type: "text/javascript" } }),
    );
    expect(out).toContain("<script>");
    expect(out).toContain("<\\/script>"); // エスケープされている
    expect(hasRelativeSubresource(out)).toBe(false);
  });

  it("ESM（type=module）は残してフォールバックさせる", async () => {
    const html = '<script type="module" src="app.mjs"></script>';
    const out = await inlineHtmlResources(
      html,
      "index.html",
      fetcherFrom({ "app.mjs": { body: "export const x=1", type: "text/javascript" } }),
    );
    expect(out).toContain('src="app.mjs"'); // 残っている
    expect(hasRelativeSubresource(out)).toBe(true); // → 呼び出し側はフォールバック
  });

  it("画像を data URI 化する", async () => {
    const html = '<img src="logo.png">';
    const out = await inlineHtmlResources(
      html,
      "index.html",
      fetcherFrom({ "logo.png": { body: "PNGDATA", type: "image/png" } }),
    );
    expect(out).toContain("src=\"data:image/png;base64,");
    expect(hasRelativeSubresource(out)).toBe(false);
  });

  it("サブフォルダの相対参照を解決する（CSS 内 url() はその CSS 基準）", async () => {
    const html = '<link rel="stylesheet" href="css/style.css">';
    const out = await inlineHtmlResources(
      html,
      "index.html",
      fetcherFrom({
        "css/style.css": { body: "body{background:url(../img/bg.png)}", type: "text/css" },
        "img/bg.png": { body: "IMG", type: "image/png" },
      }),
    );
    expect(out).toContain("url(\"data:image/png;base64,");
    expect(hasRelativeSubresource(out)).toBe(false);
  });

  it("@import を再帰的に取り込む", async () => {
    const html = '<link rel="stylesheet" href="a.css">';
    const out = await inlineHtmlResources(
      html,
      "index.html",
      fetcherFrom({
        "a.css": { body: '@import "b.css"; a{color:red}', type: "text/css" },
        "b.css": { body: "b{color:blue}", type: "text/css" },
      }),
    );
    expect(out).toContain("b{color:blue}");
    expect(out).toContain("a{color:red}");
    expect(out).not.toContain("@import");
  });

  it("取得できない参照は残す（呼び出し側でフォールバック）", async () => {
    const html = '<script src="missing.js"></script>';
    const out = await inlineHtmlResources(html, "index.html", fetcherFrom({}));
    expect(out).toContain('src="missing.js"');
    expect(hasRelativeSubresource(out)).toBe(true);
  });

  it("絶対 URL（CDN）はそのまま残す", async () => {
    const html = '<script src="https://cdn.example.com/x.js"></script>';
    const out = await inlineHtmlResources(html, "index.html", fetcherFrom({}));
    expect(out).toContain('src="https://cdn.example.com/x.js"');
  });

  it("サイズ上限を超えると InlineSizeExceededError", async () => {
    const big = "x".repeat(1000);
    const html = '<script src="big.js"></script>';
    await expect(
      inlineHtmlResources(
        html,
        "index.html",
        fetcherFrom({ "big.js": { body: big, type: "text/javascript" } }),
        { maxTotalBytes: 100 },
      ),
    ).rejects.toBeInstanceOf(InlineSizeExceededError);
  });

  it("スペースを含むファイル名（Drive で頻出）の CSS/JS も取り込む", async () => {
    const html =
      '<link rel="stylesheet" href="my style.css"><script src="my app.js"></script>';
    const out = await inlineHtmlResources(
      html,
      "index.html",
      fetcherFrom({
        "my style.css": { body: "h1{color:red}", type: "text/css" },
        "my app.js": { body: "var x=1", type: "text/javascript" },
      }),
    );
    expect(out).toContain("<style>h1{color:red}</style>");
    expect(out).toContain("<script>var x=1</script>");
    expect(hasRelativeSubresource(out)).toBe(false);
  });

  it("外部 CSS 内の </style> をエスケープして style ブロック早期終了を防ぐ", async () => {
    const html = '<link rel="stylesheet" href="s.css">';
    const out = await inlineHtmlResources(
      html,
      "index.html",
      fetcherFrom({ "s.css": { body: 'a::before{content:"</style>"}', type: "text/css" } }),
    );
    expect(out).not.toContain("</style>x"); // 早期終了していない
    expect(out).toContain("<\\/style>"); // エスケープ済み
    // 終了タグは末尾の 1 つだけ
    expect(out.match(/<\/style>/g)?.length).toBe(1);
  });

  it("相対 srcset はインライン化せず残す（→ 安全にフォールバック）", async () => {
    const html = '<img srcset="small.png 1x, big.png 2x">';
    const out = await inlineHtmlResources(
      html,
      "index.html",
      fetcherFrom({
        "small.png": { body: "S", type: "image/png" },
        "big.png": { body: "B", type: "image/png" },
      }),
    );
    expect(out).toContain("small.png"); // 変換されず残る
    expect(hasRelativeSubresource(out)).toBe(true); // → 呼び出し側はフォールバック
  });

  it("インライン <style> 内の url() も data URI 化する", async () => {
    const html = "<style>div{background:url(bg.png)}</style>";
    const out = await inlineHtmlResources(
      html,
      "index.html",
      fetcherFrom({ "bg.png": { body: "IMG", type: "image/png" } }),
    );
    expect(out).toContain("url(\"data:image/png;base64,");
    expect(hasRelativeSubresource(out)).toBe(false);
  });
});
