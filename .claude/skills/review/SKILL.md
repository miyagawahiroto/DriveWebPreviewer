---
name: review
description: git diff の変更を DriveWebPreviewer のアーキテクチャ（仮想 Web サーバー・Service Worker・Drive API・権限最小化）に沿って包括的にレビューする
allowed-tools: Bash, Read, Grep, Glob, Agent
effort: max
argument-hint: "[対象ファイルやレビュー観点の補足（省略可）]"
---

# DriveWebPreviewer コードレビュー

以下の手順で、現在の git diff を DriveWebPreviewer のドメイン特性（Chrome 拡張 MV3 / Service Worker による仮想 Web サーバー / Google Drive API 連携 / 権限最小化・プライバシーファースト）に沿ってレビューしてください。

## 0. 変更の取得

```
git diff --stat
git diff
```

すべての変更ファイルと差分を取得し、変更の全体像を把握する。
$ARGUMENTS が指定されている場合は、その観点・ファイルに特に注目する。

## 1. 変更の理解

各ファイルの変更について、**なぜこの変更が必要だったのか**を理解する。
diff だけでなく Read で周辺コンテキストも読み、以下を把握する：

- 変更の目的・意図（プレビュー体験のどこが改善されるか）
- 影響範囲（fetch インターセプト・Drive API 通信・キャッシュ・認証・パス解決・UI への波及）
- **仕様書ファースト**: CLAUDE.md の規約上、仕様書なしでの実装は禁止。`docs/` 配下に対応する仕様があるか、または仕様書側も更新されているか確認する

## 2. コード品質チェック

### 2a. エラーケース・堅牢性

- 例外処理: try-catch の漏れ、catch 後の処理が適切か（特に Drive API 呼び出し・`fetch` インターセプトのハンドラ・`chrome.identity` のコールバック）
- null / undefined: `?? null` / `?.` の適用漏れ。`files.list` が空配列・複数ヒットを返すケース
- **仮想サーバー応答の網羅性**: インターセプトしたリクエストに対し、ファイルが無い（404）・権限が無い（403）・認証切れ（401）・取得失敗（5xx）を適切なステータスと `Content-Type` で返しているか。`Response` を返し損ねてタブが無限ローディングにならないか
- タイムアウト: Drive API 呼び出し・認証フローにタイムアウト / リトライ方針があるか
- エッジケース: 空ファイル、巨大バイナリ、同名ファイル複数ヒット、親フォルダ直下に存在しないネストパス、クエリ文字列付き URL（`style.css?v=2`）

### 2b. セキュリティ・プライバシー（最重要）

- **外部送信の禁止**: ファイル内容・OAuth トークン・ファイル ID 等を**拡張外のサーバーへ送信していないか**。`fetch` の宛先が Google Drive API（および明示的に許可された Google ドメイン）以外になっていないか
- **トークンの取り扱い**: アクセストークンを `console.log` 出力・永続ストレージ（`chrome.storage.local`）へ平文保存していないか。失効時に `removeCachedAuthToken` で再取得しているか
- **権限最小化**: `manifest.json` の `permissions` / `host_permissions` / OAuth `scopes` が必要最小限か。今回の変更で不要に広い権限（`<all_urls>`、書き込みスコープ等）が追加されていないか
- **機密値の直書き禁止**: OAuth クライアントシークレット・API キー・サービスアカウント鍵をソースや `manifest.json` にハードコードしていないか（クライアント ID は公開値なので可）
- **コンテンツの安全性**: Drive から取得した HTML/JS を拡張ページのオリジン（`chrome-extension://`）でそのまま実行することのリスク（CSP・拡張権限の漏洩）を検討しているか
- **Google Cloud 設定の独断変更禁止**: OAuth スコープ追加・同意画面公開設定・IAM 大権限付与などが diff に含まれていないか確認（これらは人間が判断する）

### 2c. Service Worker ライフサイクル（MV3 特有・重要）

Manifest V3 の Service Worker は数分でスリープし、グローバル変数がリセットされる前提でレビューする。

- **状態の永続化**: 親フォルダ ID・プレビューセッション情報などスリープをまたいで必要な状態を、メモリ変数ではなく `chrome.storage.session` 等へ保存・復元しているか
- **トップレベル初期化への依存**: SW のトップレベルで一度だけ実行される初期化（イベントリスナ登録は除く）に状態を持たせていないか。`chrome.runtime.onInstalled` 以外で永続前提のグローバルを使っていないか
- **イベントリスナ登録のタイミング**: `fetch` / `onMessage` などのリスナがトップレベルで同期的に登録されているか（非同期内での登録は SW 再起動で取りこぼす）
- **`waitUntil` / `respondWith`**: 非同期処理の完了前に SW が落ちないよう `event.respondWith` / `event.waitUntil` で適切に待っているか

### 2d. Drive API・ファイル解決

- **同名ファイル解決**: `files.list` が複数ヒットしたとき、**更新日時（または作成日時）が最新**を優先する規約（CLAUDE.md）に沿っているか。並び順（`orderBy`）やソートが実装されているか
- **パス解決**: 相対パス（`href="css/style.css"`・`../img/a.png`）を親フォルダ起点で正しくファイル ID に解決しているか。ディレクトリ階層を辿る実装が抜けていないか
- **クエリ最小化**: `files.list` の `fields` を必要な項目に絞り、ページネーション（`nextPageToken`）を考慮しているか
- **メディア取得**: `files.get?alt=media` でバイナリを `arrayBuffer` / `blob` として正しく扱い、テキスト化で壊していないか

### 2e. Content-Type / MIME 解決

- 拡張子 / Drive `mimeType` から返却 `Content-Type` を解決するロジックが網羅的か（`html` / `css` / `js`(`text/javascript`) / `json` / `svg` / `png` / `jpg` / `webp` / `woff2` / `wasm` 等）
- 未知の拡張子に対するフォールバック（`application/octet-stream` 等）があるか
- 文字コード（`charset=utf-8`）の付与が必要なテキスト系で漏れていないか

### 2f. キャッシュ（Cache API）

- **キー設計**: キャッシュキーがファイル ID・更新日時・プレビューセッションを適切に含み、別ファイル / 旧版を取り違えないか
- **無効化**: ファイル更新時・セッション終了時にキャッシュを無効化できるか。古いキャッシュが残り続けないか（容量上限・LRU 等）
- **ヒット判定**: キャッシュヒット時に Drive API 呼び出しをスキップしているか

### 2g. メッセージング（content ⇄ background ⇄ popup）

- `chrome.runtime.sendMessage` / `onMessage` のメッセージ種別が `snake_case` 規約に沿い、型（`types/message.ts`）と一致しているか
- 非同期応答時に `return true`（または Promise）でチャネルを開いたままにしているか
- content script からの入力（ファイル ID・フォルダ ID）を background 側で検証しているか

### 2h. パフォーマンス

- 同一ファイルへの重複 API 呼び出しをキャッシュ / in-flight dedupe で抑えているか
- `files.list` をリクエストごとに無駄に繰り返していないか（フォルダ内インデックスのキャッシュ）
- 大きなバイナリをメモリに展開し続ける構造になっていないか

## 3. 全レイヤー整合性チェック

変更が複数レイヤーにまたがる場合、すべてのレイヤーで整合が取れているか確認する。

| レイヤー | チェック対象 |
|----------|------------|
| `manifest.json` | `permissions` / `host_permissions` / `oauth2.scopes` / `web_accessible_resources` / `background.service_worker` |
| Service Worker (`background/`) | fetch インターセプト・ルーティング・状態復元・リスナ登録 |
| Drive 連携 (`lib/drive-api.ts`, `lib/auth.ts`) | API 呼び出し・同名解決・OAuth トークン |
| パス / MIME (`lib/path-resolver.ts`, `lib/content-type.ts`) | 相対パス解決・Content-Type マッピング |
| キャッシュ (`lib/cache.ts`) | キー設計・無効化 |
| 状態 (`lib/session-state.ts`) | `chrome.storage.session` への保存・復元 |
| UI (`content/`, `popup/`, `options/`) | ボタン注入・起動導線・認証状態表示 |
| 型定義 (`types/`) | DriveFile / message / preview セッション |

**特に権限・スコープ・メッセージスキーマ変更時は、すべてのレイヤーで判定／フィールド名が統一されているか必ず確認する。** Grep で旧パターンを検索し、変更漏れがないか調べる。

### 命名規則の遵守

CLAUDE.md の命名規則に従っているか確認する：

- 変数・関数: `camelCase`（例: `interceptFetch`, `resolveFilePath`, `getAuthToken`）
- クラス・型: `PascalCase`（例: `DriveApiClient`, `PreviewSession`）
- 定数: `UPPER_SNAKE_CASE`（例: `DRIVE_API_BASE`, `CACHE_NAME`）
- **メッセージ種別（content ⇄ background）: `snake_case`**（例: `start_preview`, `auth_required`）
  → ここの揺れ（camelCase ⇄ snake_case）がメッセージ取りこぼしの温床になる

### 重複コード・並行実装の整合性

同じロジックが複数ファイルに存在するパターンに注意。変更が片方だけに適用され、もう片方が取り残されていないか確認する。

| ロジック | 想定される配置 |
|----------|---------------|
| ファイル ID 解決・同名優先ルール | `lib/drive-api.ts`, `lib/path-resolver.ts` |
| Content-Type 判定 | `lib/content-type.ts`（他に散らばっていないか） |
| 認証トークン取得 | `lib/auth.ts`（各所で直接 `getAuthToken` していないか） |
| 状態の保存・復元 | `lib/session-state.ts` |

**確認方法**: 変更対象の関数名・パターンを Grep し、同じロジックが他のファイルにもないか検索する。

### 依存先の追跡

変更によって新たに呼び出されるようになった関数・モジュール・API がある場合、その依存先も確認する。

- 新たに利用した `chrome.*` API が `manifest.json` の `permissions` に含まれているか
- 新たにアクセスする Google ドメインが `host_permissions` に含まれているか
- 新たに要求するデータが OAuth スコープの範囲内か

### 既存コードへの影響チェック

- **manifest のパターン衝突**: `web_accessible_resources`・`content_scripts.matches`・`host_permissions` の重複や過剰
- **共有リソース競合**: 同じ `chrome.storage` キー、同じ Cache 名を別意味で使っていないか
- **型・export 名の重複**: `types/` への追加分が既存 export と衝突しないか

## 4. 仕様書・ドキュメント整合性

CLAUDE.md は「**機能の追加・変更を行う際は、必ず先に仕様書を作成・更新してから実装に入ること**」を必須としている。コード変更に対応する仕様書更新が含まれているかを必ず確認する。

| 変更領域 | 関連ドキュメント |
|---------|----------------|
| 全体アーキテクチャ | `docs/ARCHITECTURE.md` |
| Service Worker・fetch インターセプト・状態復元 | `docs/SERVICE_WORKER.md` |
| Drive API・ファイル検索 / 取得・同名解決 | `docs/DRIVE_API.md` |
| 認証・スコープ・トークン管理 | `docs/AUTH.md` |
| 相対パス解決 | `docs/PATH_RESOLUTION.md` |
| キャッシュ | `docs/CACHE.md` |
| Content-Type マッピング | `docs/CONTENT_TYPE.md` |
| UI（ボタン注入・ポップアップ・設定） | `docs/UI.md` |
| 権限・プライバシー | `docs/SECURITY.md` |
| テスト方針 | `docs/TESTING.md` |

**確認方法**: 変更に関連するキーワードで `docs/` を Grep し、古い記述が残っていないか検索する。

### コメント・型定義の整合性

- コード内コメントが新しい実装と一致しているか
- `types/*.ts` のコメントに記載された制約値（キャッシュ上限・対応 MIME 一覧など）が定数・実装と一致しているか

## 5. ビルドチェック

CLAUDE.md の規約上、ファイル編集後は必ずビルド / 型チェックを実行する：

- `src/` の変更 → `npm run build`（または `npm run typecheck`）
- `manifest.json` の変更 → JSON 構文・必須フィールド（`manifest_version: 3`・`background.service_worker`）を手動確認
- **実際の Chrome Web Store への公開は行わない**

## 6. レビュー結果の出力

以下のフォーマットで結果を出力する：

### 変更サマリ

ファイルごとの変更内容を簡潔にまとめる。

### 指摘事項

指摘がある場合、以下の形式で出力する：

**[ファイルパス:行番号] — 説明**
- 問題の内容
- 提案する修正

### チェック結果テーブル

| 観点 | 結果 |
|------|------|
| エラーケース・仮想サーバー応答網羅 | OK / 指摘あり |
| セキュリティ・プライバシー（外部送信・トークン・権限最小化） | OK / 指摘あり |
| Service Worker ライフサイクル（状態復元） | OK / 指摘あり |
| Drive API・同名解決・パス解決 | OK / 該当なし |
| Content-Type / MIME 解決 | OK / 該当なし |
| キャッシュ（キー・無効化） | OK / 該当なし |
| メッセージング | OK / 該当なし |
| パフォーマンス | OK / 指摘あり |
| 全レイヤー整合性（manifest 含む） | OK / 指摘あり |
| 命名規則（snake_case メッセージ等） | OK / 指摘あり |
| 重複コード整合性 | OK / 指摘あり |
| 仕様書 (`docs/`) | OK / 指摘あり |
| ビルド / 型チェック | OK / 失敗 |
