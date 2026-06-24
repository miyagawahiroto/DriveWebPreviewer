import { describe, expect, it } from "vitest";
import { isNewer } from "../src/lib/drive-api.js";
import type { DriveFile } from "../src/types/drive.js";

function file(partial: Partial<DriveFile>): DriveFile {
  return { id: "x", name: "n", mimeType: "text/html", ...partial };
}

describe("drive-api.isNewer（同名ファイル解決）", () => {
  it("modifiedTime が新しい方を優先する", () => {
    const a = file({ modifiedTime: "2024-02-01T00:00:00Z" });
    const b = file({ modifiedTime: "2024-01-01T00:00:00Z" });
    expect(isNewer(a, b)).toBe(true);
    expect(isNewer(b, a)).toBe(false);
  });

  it("modifiedTime が同じなら createdTime で比較する", () => {
    const a = file({
      modifiedTime: "2024-01-01T00:00:00Z",
      createdTime: "2024-01-01T10:00:00Z",
    });
    const b = file({
      modifiedTime: "2024-01-01T00:00:00Z",
      createdTime: "2024-01-01T09:00:00Z",
    });
    expect(isNewer(a, b)).toBe(true);
  });

  it("modifiedTime が無ければ createdTime をフォールバックに使う", () => {
    const a = file({ createdTime: "2024-03-01T00:00:00Z" });
    const b = file({ createdTime: "2024-01-01T00:00:00Z" });
    expect(isNewer(a, b)).toBe(true);
  });
});
