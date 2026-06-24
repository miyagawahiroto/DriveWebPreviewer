import { defineConfig } from "vitest/config";

// chrome 非依存の純粋ロジックをユニットテストする（docs/TESTING.md）。
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
