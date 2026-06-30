# TESTING - テスト方針

## 1. レイヤー別方針

| 対象 | 方式 |
|------|------|
| `lib/` の純粋ロジック（path-resolver / content-type / markdown） | ユニットテスト（Vitest 等。`chrome` 非依存に分離して書く） |
| `drive-api` / `auth`（`chrome.*` / fetch 依存） | `chrome` API・`fetch` をモックしたユニットテスト |
| Service Worker のルーティング | リクエスト URL → 期待 Response のテーブルテスト（依存をモック） |
| 拡張全体（E2E） | 手動 + Playwright（拡張をロードした Chromium）で代表シナリオ |

## 2. ユニットテスト指針

- **`chrome` 非依存ロジックを優先的に切り出す**: `content-type.resolve` / `path-resolver.normalize` は純関数として書き、テストしやすくする
- `drive-api` は `fetch` をモックし、同名複数ヒット時に更新日時最新を選ぶことを検証する
- `content-type` は主要拡張子・未知拡張子フォールバックを網羅する
- `markdown` は `marked` が実際に動くため `chrome` 非依存でテスト可能。HTML 変換・タイトルエスケープに加え、**mermaid ブロック → `<pre class="mermaid">` 変換**と**スクリプト注入判定**（mermaid 有/無・runtime URL 有/無・リテラル表示で無駄注入しない）を検証する。実際の図 SVG 描画と CSP 適合は実ブラウザが必要なため E2E 側（4 節）で確認する

## 3.5 Markdown / Mermaid の確認範囲

- **ユニットで確認できる（ブラウザ不要）**: 変換結果の HTML 文字列・mermaid プレースホルダ出力・スクリプト注入の有無（`test/markdown.test.ts`）
- **実機が必要（ユニット不可）**: `assets/mermaid-runtime.js` による実 SVG 描画、拡張オリジン（`chrome-extension://`）の CSP 違反が出ないこと。`samples/06-mermaid/` を使い `chrome://extensions` の unpacked で確認する（`MERMAID.md` 8）

## 3. E2E 代表シナリオ

1. 単一 HTML のプレビュー（`Content-Type: text/html` で表示）
2. CSS / 画像を含むページで相対パスが解決され崩れない
3. サブフォルダ（`css/style.css`）のパス解決
4. 同名ファイルがあるとき最新版が表示される
5. 未認証状態からのサインイン → プレビュー
6. Service Worker スリープ後の再リクエストで状態復元（`chrome.storage.session` から復元）

## 4. ビルド検証

CLAUDE.md 準拠で、編集後は `npm run build`（または `npm run typecheck`）を実行する。`manifest.json` は構文と必須フィールドを確認する。

## 5. 関連

`ARCHITECTURE.md` / `SERVICE_WORKER.md`
