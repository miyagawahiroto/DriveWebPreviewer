// DriveWebPreviewer ビルドスクリプト（esbuild）
// - src/ 配下の各エントリ（service-worker / content-script / popup / options）を dist/ にバンドル
// - manifest.json と静的アセット（HTML / icons）を dist/ にコピー
// 使い方: node build.mjs [--watch]

import { build, context } from "esbuild";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(root, "src");
const outDir = resolve(root, "dist");
const watch = process.argv.includes("--watch");
// リリース（ストア公開）ビルド。manifest に公開版の key と client_id を注入する。
const release = process.argv.includes("--release");

// 公開版（ストア）アイテムの公開鍵（公開値・非機密）。
// リリースビルドで manifest.key に注入し、ローカル unpacked と公開版の拡張機能 ID
// （jgebfohfmadmkcdcondhhhjjmcelbgfd）を一致させる。
const RELEASE_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA5h2FAhJv8h7g3wxtarSiPtK1zDq8Ns4l1OQkd5DknzqsixyZ/6tyTZd6FAbJ8hyfjEBIu1/J26YKmnTmx7IVwZew06rdpHUL5rZ79GGYb16cVFMSiCQolsf5hghXkZPu1mOcD3IESGRR+e2DziFShSUNt8grwpbPiIchvTyGS1kpig8xFGxO7gnP5MKr6X6IZyzhG4VErof8zhs/MEqo4Ngq8kCPvrDIWxJszZ/B4N8nwXqFl+r8fINbLqL2Nayru9VmpFRl47YONiSlh36KpowBJHxUEwEC1yBRAsJ7m8ljDm9znjndgknqxf/xLNAwdlGeuvSkKMsQqTbZ7IEaJwIDAQAB";

/** .env.local（git 管理外）を読み込む。値はビルド時にのみ使用し、コミットしない。 */
function loadEnvLocal() {
  const file = resolve(root, ".env.local");
  const env = {};
  if (!existsSync(file)) return env;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#")) {
      env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

const localEnv = loadEnvLocal();
for (const key of ["DWP_PICKER_API_KEY", "DWP_GCP_PROJECT_NUMBER"]) {
  if (!localEnv[key]) {
    console.warn(`[build] ${key} が未設定です（Picker 機能は動作しません）。.env.local を確認してください。`);
  }
}

/** バンドル対象のエントリ（入力 → 出力パス） */
const entryPoints = {
  "background/service-worker": resolve(srcDir, "background/service-worker.ts"),
  "content/content-script": resolve(srcDir, "content/content-script.ts"),
  "popup/popup": resolve(srcDir, "popup/popup.ts"),
  "options/options": resolve(srcDir, "options/options.ts"),
};

/** dist へそのままコピーする静的アセット（manifest.json は writeManifest で別途生成） */
const staticAssets = [
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
  // ビルド時注入（.env.local の値。リポジトリには含めない）
  // 環境固有値はソースに直書きせず、参考値は .env.example にのみ記載する
  define: {
    __PICKER_API_KEY__: JSON.stringify(localEnv.DWP_PICKER_API_KEY ?? ""),
    __GCP_PROJECT_NUMBER__: JSON.stringify(localEnv.DWP_GCP_PROJECT_NUMBER ?? ""),
  },
};

/** manifest.json を生成する。リリース時のみ key と公開用 client_id を注入する。 */
async function writeManifest() {
  const manifest = JSON.parse(readFileSync(resolve(srcDir, "manifest.json"), "utf8"));
  if (release) {
    manifest.key = RELEASE_KEY;
    const clientId = localEnv.DWP_RELEASE_CLIENT_ID;
    if (clientId) {
      // 公開版（jgebf…）用 client_id で上書き
      manifest.oauth2 = { ...manifest.oauth2, client_id: clientId };
    } else {
      console.warn(
        "[build] release: DWP_RELEASE_CLIENT_ID 未設定。dev 用 client_id のままです" +
          "（公開版 jgebf… ではサインインに失敗します）。.env.local に公開用クライアントを設定してください。",
      );
    }
  }
  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
}

async function copyStatic() {
  await writeManifest();
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
