# DriveWebPreviewer - Google Drive 上の Web ページをそのままプレビューする Chrome 拡張機能

Google Drive に置いた HTML / CSS / JavaScript / 画像で構成された Web ページを、**外部サービスに権限を渡すことなく**、ブラウザの拡張機能内に構築した「仮想 Web サーバー」を通じてそのままレンダリングしてプレビューする Chrome 拡張機能（Manifest V3）。

> **重要**: 機能の追加・変更を行う際は、必ず先に仕様書（docs/配下のドキュメント）を作成・更新してから実装に入ること。仕様書なしでのコード修正は禁止。

---

## プロダクト概要

Google Drive 単体では HTML をソースコードとして表示してしまい、Web ページとしてレンダリングできない。本拡張は **Service Worker をローカルの仮想 Web サーバーとして動作させ**、`chrome-extension://` 内部 URL へのリクエストを横取り（intercept）して Google Drive API からファイルを取得し、適切な `Content-Type` を付けてブラウザに返すことで、Drive 上のページをそのまま表示する。

### 解決する 3 つの課題

1. **公式機能の不在** — Drive は HTML を Web ページとしてレンダリングできず、ソースコードが表示される
2. **サードパーティ製への懸念** — 既存の外部サービス（DriveToWeb 等）は外部システムに Drive のアクセス権限を渡す必要があり、社内資料・モックアップを扱うにはセキュリティ上の心理的ハードルが高い。本拡張は **OAuth トークンをブラウザ内（`chrome.identity`）で完結させ、外部サーバーにファイルや権限を一切渡さない**
3. **複数ファイルのパス解決の壁** — HTML 単体表示では `href="style.css"` のような相対パスがリンク切れになる。本拡張は後続の CSS・JS・画像リクエストも親フォルダ内から解決して返すため、ページが崩れない

---

## ターゲットユーザー

| ユーザー | ニーズ |
|----------|--------|
| 社内ディレクター / デザイナー | 社内資料・モックアップを外部に出さず、Drive 上で安全にプレビュー共有したい |
| エンジニア | ビルド済みの静的サイト・LP を Drive にアップして手軽に表示確認したい |
| 受託・制作会社 | クライアントに渡す前の Web 成果物を、権限を渡さず安全に確認したい |

---

## システム設計

### 中核アイデア

「ブラウザの拡張機能内に、Drive API と通信する**仮想の Web サーバー**を構築する」。Service Worker の `fetch` イベントをインターセプトし、Drive API からのデータを「通常の Web サーバーからの応答」に見せかけて返す。

### 処理フロー

1. **プレビュー実行 (Trigger)** — ユーザーが Drive 上で `index.html` を選択し、拡張機能のボタンをクリック。拡張は対象の **ファイル ID** と **親フォルダ ID** を取得する
2. **仮想 URL の展開 (Virtual URL)** — 拡張が新しいタブで専用の内部 URL（例: `chrome-extension://<拡張機能ID>/preview/index.html`）を開く
3. **通信のインターセプト (Intercept)** — 待機中の Service Worker が、そのタブ内で発生するすべてのネットワークリクエスト（fetch）を横取りする
4. **Drive API によるデータ取得 (Fetch API)** — Service Worker が Google Drive API を叩き、対象ファイルのテキスト・バイナリデータを取得する
5. **動的レンダリング (Response)** — 取得データに適切な `Content-Type`（`text/html`・`text/css`・`image/png` 等）を付与し、ブラウザに通常応答として返却する。後続の CSS・画像リクエストも 3〜5 を繰り返し、親フォルダ内から該当ファイルを検索して返す

### 技術的ハードルと対策

| 技術的な壁 | 発生する問題 | 設計上の対策 |
|-----------|------------|-------------|
| API の通信ラグ | CSS・画像が多いページは都度 API を叩くため表示が遅い | Service Worker 内に **Cache API** によるキャッシュ機構を持たせ、一度取得したファイルは素早く返す |
| 同名ファイルの存在 | Drive は同フォルダに同名ファイルを作成でき、API 検索で複数ヒットしうる | **更新日時（または作成日時）が最新のもの**を優先取得するルールを設ける |
| Service Worker の寿命 | Manifest V3 の仕様で SW は数分でスリープし、メモリ上の変数がリセットされる | 親フォルダ ID 等の必須情報を都度 **`chrome.storage.session`** に保存し、スリープ復帰後も状態を復元する |
| CORS / 認証 | Google の OAuth トークンを安全に管理する必要がある | **`chrome.identity` API** を活用し、安全かつシームレスに Google アカウント認証を行う。トークンはブラウザ内で完結し外部に出さない |

---

## 技術スタック（推奨 / 一部未確定）

> 現時点の推奨。PoC 検証を経て確定する。

### 拡張機能本体
- **Manifest V3** - Chrome 拡張のマニフェスト仕様（`service_worker` バックグラウンド）
- **TypeScript** - 型安全な実装
- **Service Worker** - `fetch` インターセプトによる仮想 Web サーバー
- **バンドラ** - **TBD**（Vite / esbuild / webpack を PoC で比較）。MV3 の Service Worker 出力に対応するものを選定

### Google 連携
- **Google Drive API (v3)** - ファイル検索（`files.list`）・取得（`files.get?alt=media`）
- **`chrome.identity` API** - OAuth2 認証・アクセストークン取得（`getAuthToken`）
- **`chrome.storage.session`** - SW スリープ復帰のための状態保存（ファイル ID・親フォルダ ID 等）
- **Cache API** - 取得済みファイルのキャッシュ

### UI（ポップアップ / コンテンツスクリプト）
- **HTML + TypeScript（軽量構成を基本）** - ポップアップ・設定 UI
- **コンテンツスクリプト** - Drive 画面上へのプレビューボタン注入（DOM 注入方式は PoC で検証）

---

## ファイル構成（予定）

```
src/
├── manifest.json               # Manifest V3 マニフェスト（権限・SW・OAuth クライアント ID）
├── background/
│   └── service-worker.ts       # 仮想 Web サーバー本体（fetch インターセプト・ルーティング）
├── lib/
│   ├── drive-api.ts            # Drive API クライアント（files.list / files.get・同名解決）
│   ├── auth.ts                 # chrome.identity による OAuth トークン取得・更新・失効
│   ├── cache.ts                # Cache API ラッパー（キー設計・無効化）
│   ├── content-type.ts         # 拡張子 / Drive mimeType → レスポンス Content-Type 解決
│   ├── path-resolver.ts        # 相対パス → 親フォルダ内ファイル ID 解決
│   └── session-state.ts        # chrome.storage.session への状態保存・復元
├── content/
│   └── content-script.ts       # Drive UI 上のプレビューボタン注入・ファイル ID 取得
├── popup/
│   ├── popup.html              # 拡張アイコンのポップアップ UI
│   └── popup.ts                # プレビュー起動・認証状態表示
├── preview/
│   └── loading.html            # プレビュータブの初期 HTML（SW が中身を差し替える前提）
├── options/
│   ├── options.html            # 設定ページ（キャッシュ・既定動作）
│   └── options.ts
└── types/
    ├── drive.ts                # DriveFile / DriveListResponse 等の型
    ├── message.ts              # content ⇄ background 間メッセージ型
    └── preview.ts              # プレビューセッション状態の型
docs/                           # 仕様書（実装前に必ず作成・更新）
```

---

## コーディングガイドライン

### 命名規則
- 変数・関数名: `camelCase`（例: `interceptFetch`, `resolveFilePath`, `getAuthToken`）
- クラス・型名: `PascalCase`（例: `DriveApiClient`, `PreviewSession`, `DriveFile`）
- 定数: `UPPER_SNAKE_CASE`（例: `DRIVE_API_BASE`, `CACHE_NAME`, `MAX_CACHE_ENTRIES`）
- メッセージ種別（content ⇄ background）: `snake_case`（例: `start_preview`, `auth_required`, `file_resolved`）

### 表記ルール
- **`§`（セクション記号）は使用禁止**: ドキュメント・コードコメント・テストのいずれでも `§` を使わない。節を参照する場合は「10.6 節」や「10.6」のように記述する。

### 実装方針
- **権限最小化（プライバシーファースト）**: 外部サーバーへファイルや OAuth トークンを送信しない。すべてブラウザ内（Service Worker / `chrome.identity` / `chrome.storage`）で完結させる。`manifest.json` の `permissions` / `host_permissions` は必要最小限に絞る
- **MV3 の Service Worker 寿命を前提に書く**: グローバル変数は SW スリープで消える前提。永続が必要な状態は必ず `chrome.storage.session`（またはタブ寿命に紐づく場所）へ保存し、起動時に復元する。トップレベルでの非同期初期化に依存しない
- **仮想サーバーとしての堅牢性**: `fetch` インターセプトでは、Drive にファイルが無い・権限が無い・同名複数ヒット・バイナリ/テキスト混在などを想定し、適切なステータスコードと `Content-Type` を返す
- **パフォーマンス**: Cache API を活用し、同一ファイルへの重複 API 呼び出しを避ける。プレビューセッション単位でキャッシュを分離・無効化できる設計にする
- **観測可能性**: 障害解析のため、インターセプトしたリクエスト・解決結果・キャッシュヒット状況を（センシティブ値を出さずに）ログできる構造にする

---

## 開発コマンド

```bash
npm install        # 依存インストール
npm run dev        # 開発ビルド（watch）。chrome://extensions で「パッケージ化されていない拡張機能を読み込む」
npm run build      # 本番ビルド（dist/ 出力）
npm run lint       # 静的解析
npm run typecheck  # 型チェック（tsc --noEmit）
```

> ビルド成果物（`dist/` 等）を Chrome の `chrome://extensions`（デベロッパーモード）で読み込んで動作確認する。

---

## リリース / 配布

> **重要**: Chrome Web Store への公開・更新（アップロード）は、ユーザーから明示的に指示された場合のみ実行すること。ビルド確認やコード修正の完了後に自動的に公開してはならない。

- 配布は **Chrome Web Store** を基本とする（社内配布の場合はポリシーに応じて検討）
- バージョンは `manifest.json` の `version` で管理する
- 公開アップロード手順は確定後に `docs/` に記載する（TBD）

---

## シークレット・認証情報の取り扱い（重要）

Chrome 拡張は配布時に中身（manifest・スクリプト）が利用者に展開されるため、**機密値をコードに同梱できない**前提で設計する。

### 禁止事項

- OAuth **クライアントシークレット** や API キー等の機密値をソース・`manifest.json`・設定ファイルにハードコードする
- `.env` 等の機密ファイルを git にコミットする（`.gitignore` で除外。例外を作らない）
- 取得した OAuth **アクセストークン**をログ・外部送信・永続ストレージへ平文で残す
- 秘匿値を Slack / 課題管理ツールに貼り付ける（リンクで参照する）

### 認証方式の原則

- 認証は **`chrome.identity.getAuthToken`（またはインストール型クライアントの OAuth フロー）** を用い、クライアントシークレット不要の方式を基本とする
- `manifest.json` に記載する **OAuth2 クライアント ID** は拡張機能 ID に紐づく公開値であり、コミット可とする。ただしクライアントシークレットは記載しない
- トークンはメモリまたは `chrome.identity` のキャッシュに留め、必要時に都度取得・失効（`removeCachedAuthToken`）する

### Google Cloud / OAuth 同意画面の設定

- OAuth クライアント ID の作成・スコープ追加・同意画面の公開設定など **Google Cloud Console 側の設定変更は、課金・公開範囲・セキュリティに影響するため原則として人間の管理者が行う**。AI が独断で API を叩いて設定を変更しない
- スコープは最小限（例: `drive.readonly` 相当）に絞る。スコープ追加は必ず人間が判断する

---

## コード編集時のルール

### 必須ワークフロー

1. **修正前**: 関連する設計ドキュメント（`docs/` 配下）を確認してから作業開始。なければ先に作成する
2. **修正後**: ビルド / 型チェック（`npm run build` または `npm run typecheck`）でエラーがないか確認
3. **修正後**: 機能追加・変更時は該当ドキュメントを更新

### エラーチェック

ファイル編集後は必ず `npm run build`（または `npm run typecheck`）を実行し、TypeScript のコンパイルエラーを確認すること。

### コマンド制限

- **sed コマンドの使用禁止**: ファイル編集には Edit ツール・Write ツールを使用すること
- **公開禁止**: Chrome Web Store への公開・更新はユーザーから明示的に指示された場合のみ実行すること（自動公開禁止）

---

## 関連ドキュメント

> 機能着手前に該当ドキュメントを確認・更新する（`docs/` 配下。未整備のものは実装前に作成する）。

| ドキュメント | 内容 |
|-------------|------|
| `docs/ARCHITECTURE.md` | 仮想 Web サーバー方式の全体アーキテクチャ・コンポーネント分割 |
| `docs/SERVICE_WORKER.md` | Service Worker のライフサイクル・fetch インターセプト・状態復元 |
| `docs/DRIVE_API.md` | Drive API の利用方法・ファイル検索 / 取得・同名ファイル解決ルール |
| `docs/AUTH.md` | `chrome.identity` による OAuth・スコープ・トークン管理 |
| `docs/PATH_RESOLUTION.md` | 相対パス → 親フォルダ内ファイル ID の解決アルゴリズム |
| `docs/CACHE.md` | Cache API のキー設計・無効化・セッション分離 |
| `docs/CONTENT_TYPE.md` | 拡張子 / mimeType → Content-Type マッピング |
| `docs/UI.md` | コンテンツスクリプトのボタン注入・ポップアップ・設定ページ |
| `docs/SECURITY.md` | 権限最小化・トークン保護・プライバシー方針 |
| `docs/TESTING.md` | テスト方針（ユニット・拡張機能 E2E） |
