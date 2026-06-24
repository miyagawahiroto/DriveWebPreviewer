// DriveWebPreviewer ビルドスクリプト（esbuild）
// - src/ 配下の各エントリ（service-worker / content-script / popup / options）を dist/ にバンドル
// - manifest.json と静的アセット（HTML / icons）を dist/ にコピー
// 使い方: node build.mjs [--watch]

import { build, context } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(root, "src");
const outDir = resolve(root, "dist");
const watch = process.argv.includes("--watch");

/** バンドル対象のエントリ（入力 → 出力パス） */
const entryPoints = {
  "background/service-worker": resolve(srcDir, "background/service-worker.ts"),
  "content/content-script": resolve(srcDir, "content/content-script.ts"),
  "popup/popup": resolve(srcDir, "popup/popup.ts"),
  "options/options": resolve(srcDir, "options/options.ts"),
};

/** dist へそのままコピーする静的アセット（src からの相対パス） */
const staticAssets = [
  "manifest.json",
  "popup/popup.html",
  "options/options.html",
  "preview/loading.html",
];

const buildOptions = {
  entryPoints,
  outdir: outDir,
  bundle: true,
  format: "esm",
  target: "chrome114",
  platform: "browser",
  sourcemap: watch ? "inline" : false,
  minify: !watch,
  logLevel: "info",
};

async function copyStatic() {
  for (const rel of staticAssets) {
    const from = resolve(srcDir, rel);
    if (!existsSync(from)) {
      console.warn(`[build] skip missing asset: src/${rel}`);
      continue;
    }
    const to = resolve(outDir, rel);
    await mkdir(dirname(to), { recursive: true });
    await cp(from, to);
  }
  // アイコン等のディレクトリ（あればコピー）
  const iconsDir = resolve(srcDir, "icons");
  if (existsSync(iconsDir)) {
    await cp(iconsDir, resolve(outDir, "icons"), { recursive: true });
  }
}

async function run() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  if (watch) {
    const ctx = await context(buildOptions);
    await ctx.watch();
    await copyStatic();
    console.log("[build] watching for changes...");
    // 静的アセットの変更はここでは監視しない（必要に応じて拡張）
  } else {
    await build(buildOptions);
    await copyStatic();
    console.log("[build] done →", outDir);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
