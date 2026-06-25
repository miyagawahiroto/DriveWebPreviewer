# SECURITY - セキュリティ / プライバシー

DriveWebPreviewer の権限最小化・トークン保護・プライバシー方針を定義する。

## 1. 基本原則（プライバシーファースト）

本拡張の存在意義は「外部サービスに Drive の権限を渡さずにプレビューする」こと。したがって：

- **Drive ファイルの内容（バイト列）を、拡張外のサーバーや外部ページへ一切送信・経由させない**。取得・描画は拡張内部（background の Service Worker → `chrome-extension://` のプレビュータブ）で完結する
- Drive データ取得の通信先は Google API（`*.googleapis.com`）に限定する
- 解析・テレメトリ目的であってもファイル内容や ID を外部送信しない

> **外部ページ非依存**: 一般公開向けに `drive.file` ＋ Google Picker（外部ホスト）方式を検討したが、トークンを外部ページへ渡さない方針を優先し**採用を見送った**（経緯は `PICKER.md`）。現行は `drive.readonly` ＋ content-script の「Web プレビュー」1 クリックで、**Drive データもトークンも外部を一切経由しない**。

## 2. 権限最小化

### manifest.json

| 項目 | 方針 |
|------|------|
| `permissions` | `identity`・`storage` のみ。`chrome.tabs.create` は `tabs` 権限不要のため `tabs` は付けない（「閲覧履歴の読み取り」警告を避ける） |
| `host_permissions` | `https://www.googleapis.com/*`（Drive API）のみに限定 |
| `content_scripts.matches` | `https://drive.google.com/*` に限定 |
| OAuth スコープ | `drive.readonly`（読み取り専用。`auth.ts` の `OAUTH_SCOPES`） |
| `content_security_policy` | 既定のまま（MV3 拡張ページは外部スクリプト不可。明示指定しない） |
| `web_accessible_resources` | `preview/*` のみ公開 |

スコープ・権限の追加は影響が大きいため**人間が判断する**（CLAUDE.md）。

## 3. トークン保護

- `chrome.identity` 経由でのみ取得し、クライアントシークレットは持たない
- `console.log` 等への出力禁止、永続ストレージへの平文保存禁止
- 401 時は `removeCachedAuthToken` で失効させ再取得（`AUTH.md`）

## 3.5 既知の制約：インライン script は実行できない

プレビューは `chrome-extension://` オリジンで表示され、MV3 の拡張ページ CSP（`script-src 'self' …`）が適用される。このため：

- **インラインの `<script>…</script>` / `onclick="…"` 等は実行されない**（CSP でブロック）
- **外部ファイル参照（`<script src="app.js">`）は動作する**

MV3 では拡張ページ CSP に `unsafe-inline` を追加できないため、manifest では緩和できない。

**回避策（現状）**: プレビュー対象側で JS を外部ファイルに分離する。

**恒久対応（未実装・要設計）**: プレビューをサンドボックス文脈で描画する。ただし「相対パスを SW で横取り解決」と両立しにくい（サンドボックスの不透明オリジンは SW に制御されない）ため、参照リソースをインライン化してから描画する等の対応が必要。専用タスクとして検討する。

## 4. 取得コンテンツの実行リスク

Drive から取得した HTML/JS を `chrome-extension://` オリジンで実行することには、以下のリスクがあるため留意する：

- 拡張ページのオリジンは通常の Web より権限が強い（CSP・拡張 API への近さ）
- 対策方針（PoC で検証）:
  - プレビューを **サンドボックス化された iframe / sandbox ページ**で表示し、拡張 API から隔離する案を検討
  - `web_accessible_resources` の公開範囲を最小化
  - 信頼できる自分の Drive ファイルのみを対象とする前提を明示

## 5. 機密値の管理

- OAuth クライアントシークレット・API キー・サービスアカウント鍵をリポジトリに置かない（`.gitignore` / `.claude/settings.json` の deny で機械的にも抑止）
- `manifest.json` の `client_id` は公開値のためコミット可

## 6. 関連

`AUTH.md` / `ARCHITECTURE.md`
