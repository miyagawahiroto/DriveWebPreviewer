import { describe, expect, it } from "vitest";
import { hasRelativeSubresource } from "../src/lib/html-analyze.js";

describe("hasRelativeSubresource", () => {
  it("インライン CSS/JS で完結する HTML は false（サンドボックス候補）", () => {
    const html = `<!doctype html><html><head>
      <style>body{color:red}</style></head>
      <body><h1 onclick="alert(1)">hi</h1>
      <script>console.log("inline")</script></body></html>`;
    expect(hasRelativeSubresource(html)).toBe(false);
  });

  it("相対 CSS 参照があれば true", () => {
    expect(hasRelativeSubresource('<link rel="stylesheet" href="style.css">')).toBe(true);
  });

  it("相対 JS 参照があれば true", () => {
    expect(hasRelativeSubresource('<script src="js/app.js"></script>')).toBe(true);
  });

  it("相対 img 参照があれば true", () => {
    expect(hasRelativeSubresource('<img src="assets/logo.png">')).toBe(true);
  });

  it("./ や ../ も相対として true", () => {
    expect(hasRelativeSubresource('<script src="./a.js"></script>')).toBe(true);
    expect(hasRelativeSubresource('<link href="../b.css" rel="stylesheet">')).toBe(true);
  });

  it("絶対 URL（CDN）のみなら false", () => {
    expect(
      hasRelativeSubresource('<script src="https://cdn.example.com/x.js"></script>'),
    ).toBe(false);
    expect(hasRelativeSubresource('<link href="//cdn.example.com/x.css">')).toBe(false);
  });

  it("data: / blob: は false", () => {
    expect(hasRelativeSubresource('<img src="data:image/png;base64,AAAA">')).toBe(false);
  });

  it("<a href> のページ内リンク・相対リンクはサブリソースではないので false", () => {
    expect(hasRelativeSubresource('<a href="page2.html">next</a>')).toBe(false);
    expect(hasRelativeSubresource('<a href="#section">jump</a>')).toBe(false);
  });

  it("CSS の url() 相対参照は true、data URI は false", () => {
    expect(hasRelativeSubresource("<style>body{background:url(bg.png)}</style>")).toBe(true);
    expect(
      hasRelativeSubresource("<style>body{background:url(data:image/gif;base64,AA)}</style>"),
    ).toBe(false);
  });

  it("@import の相対参照は true", () => {
    expect(hasRelativeSubresource('<style>@import "base.css";</style>')).toBe(true);
  });

  it("srcset の相対参照は true、絶対のみは false", () => {
    expect(hasRelativeSubresource('<img srcset="small.jpg 1x, big.jpg 2x">')).toBe(true);
    expect(
      hasRelativeSubresource('<img srcset="https://c/s.jpg 1x, https://c/b.jpg 2x">'),
    ).toBe(false);
  });

  it("無クオート属性の相対参照も検出する（描画破壊の誤判定を防ぐ）", () => {
    expect(hasRelativeSubresource("<img src=logo.png>")).toBe(true);
    expect(hasRelativeSubresource("<script src=app.js></script>")).toBe(true);
    expect(hasRelativeSubresource("<link rel=stylesheet href=style.css>")).toBe(true);
  });

  it("無クオート属性でも絶対 URL なら false", () => {
    expect(hasRelativeSubresource("<img src=https://cdn.example.com/a.png>")).toBe(false);
  });

  it("iframe / video / object の相対参照も true", () => {
    expect(hasRelativeSubresource('<iframe src="inner.html"></iframe>')).toBe(true);
    expect(hasRelativeSubresource('<video src="movie.mp4"></video>')).toBe(true);
    expect(hasRelativeSubresource('<object data="doc.pdf"></object>')).toBe(true);
  });
});
