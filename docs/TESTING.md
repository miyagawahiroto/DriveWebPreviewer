# TESTING - テスト方針

## 1. レイヤー別方針

| 対象 | 方式 |
|------|------|
| `lib/` の純粋ロジック（path-resolver / content-type） | ユニットテスト（Vitest 等。`chrome` 非依存に分離して書く） |
| `drive-api` / `auth`（`chrome.*` / fetch 依存） | `chrome` API・`fetch` をモックしたユニットテスト |
| Service Worker のルーティング | リクエスト URL → 期待 Response のテーブルテスト（依存をモック） |
| 拡張全体（E2E） | 手動 + Playwright（拡張をロードした Chromium）で代表シナリオ |

## 2. ユニットテスト指針

- **`chrome` 非依存ロジックを優先的に切り出す**: `content-type.resolve` / `path-resolver.normalize` は純関数として書き、テストしやすくする
- `drive-api` は `fetch` をモックし、同名複数ヒット時に更新日時最新を選ぶことを検証する
- `content-type` は主要拡張子・未知拡張子フォールバックを網羅する

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
