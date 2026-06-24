// ビルド時に esbuild の define で注入される定数（build.mjs）。
// 値は .env.local 由来。リポジトリにはコミットしない。

/** Google Picker 表示用の API キー（Picker API のみに用途制限すること）。 */
declare const __PICKER_API_KEY__: string;

/** Google Cloud プロジェクト番号（Picker の AppId）。 */
declare const __GCP_PROJECT_NUMBER__: string;
