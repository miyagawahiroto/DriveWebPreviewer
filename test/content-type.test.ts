import { describe, expect, it } from "vitest";
import { resolve } from "../src/lib/content-type.js";

describe("content-type.resolve", () => {
  it("拡張子から Content-Type を決定する", () => {
    expect(resolve("index.html")).toBe("text/html; charset=utf-8");
    expect(resolve("css/style.css")).toBe("text/css; charset=utf-8");
    expect(resolve("app.js")).toBe("text/javascript; charset=utf-8");
    expect(resolve("data.json")).toBe("application/json; charset=utf-8");
    expect(resolve("logo.svg")).toBe("image/svg+xml");
    expect(resolve("photo.JPG")).toBe("image/jpeg"); // 大文字も解決
    expect(resolve("mod.wasm")).toBe("application/wasm");
  });

  it("拡張子が不明なら driveMimeType を使う", () => {
    expect(resolve("noext", "image/png")).toBe("image/png");
  });

  it("拡張子も driveMimeType も無ければ octet-stream", () => {
    expect(resolve("noext")).toBe("application/octet-stream");
    // driveMimeType が octet-stream の場合もフォールバック
    expect(resolve("noext", "application/octet-stream")).toBe(
      "application/octet-stream",
    );
  });

  it("拡張子を driveMimeType より優先する", () => {
    // Drive がテキストを text/plain で返しても、拡張子が html なら html
    expect(resolve("page.html", "text/plain")).toBe("text/html; charset=utf-8");
  });
});
