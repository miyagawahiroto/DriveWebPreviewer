import { defineConfig } from "vitest/config";

// chrome 非依存の純粋ロジックをユニットテストする（docs/TESTING.md）。
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
  // build.mjs が esbuild の define で注入する定数を、テスト時にも解決できるようにする。
  define: {
    __OAUTH_CLIENT_ID__: JSON.stringify(""),
  },
});
