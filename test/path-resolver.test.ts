import { describe, expect, it } from "vitest";
import { normalize } from "../src/lib/path-resolver.js";

describe("path-resolver.normalize", () => {
  it("通常パスをセグメント配列にする", () => {
    expect(normalize("css/style.css")).toEqual(["css", "style.css"]);
    expect(normalize("index.html")).toEqual(["index.html"]);
  });

  it("先頭スラッシュを除去する", () => {
    expect(normalize("/index.html")).toEqual(["index.html"]);
  });

  it("空・末尾スラッシュは index.html を補う", () => {
    expect(normalize("")).toEqual(["index.html"]);
    expect(normalize("/")).toEqual(["index.html"]);
    expect(normalize("css/")).toEqual(["css", "index.html"]);
  });

  it("クエリ・ハッシュを除去する", () => {
    expect(normalize("style.css?v=2")).toEqual(["style.css"]);
    expect(normalize("page.html#sec")).toEqual(["page.html"]);
  });

  it(". と .. を解決する", () => {
    expect(normalize("a/./b.css")).toEqual(["a", "b.css"]);
    expect(normalize("a/b/../c.css")).toEqual(["a", "c.css"]);
  });

  it("ルートを超える .. は null", () => {
    expect(normalize("../secret.css")).toBeNull();
    expect(normalize("a/../../x")).toBeNull();
  });
});
