// ビルド時に esbuild の define で注入される定数（build.mjs）。
// 値は .env.local 由来。リポジトリにはコミットしない。

/**
 * OAuth クライアント ID（公開値）。launchWebAuthFlow 用の「ウェブ アプリケーション」型。
 * dev は DWP_DEV_CLIENT_ID、release は DWP_RELEASE_CLIENT_ID から注入される（build.mjs）。
 */
declare const __OAUTH_CLIENT_ID__: string;
