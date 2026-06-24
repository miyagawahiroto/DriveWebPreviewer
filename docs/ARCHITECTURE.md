# ARCHITECTURE - 全体アーキテクチャ

DriveWebPreviewer の全体構成と、各コンポーネントの責務・データフローを定義する。

## 1. 設計の中核

> ブラウザの拡張機能内に、Google Drive API と通信する**仮想の Web サーバー**を構築する。

Service Worker が `chrome-extension://<拡張機能ID>/preview/...` への `fetch` をインターセプトし、URL パスを Drive 上のファイルへ解決し、Drive API から取得したデータに適切な `Content-Type` を付けて `Response` として返す。ブラウザから見ると「通常の Web サーバー」が応答しているのと区別がつかないため、相対パスで構成されたページがそのまま表示される。

## 2. コンポーネント構成

```
┌──────────────────────────────────────────────────────────────┐
│ Google Drive のタブ（drive.google.com）                       │
│   content-script: プレビューボタンを注入し、選択ファイルの    │
│                    fileId / parentId を取得して background へ  │
└───────────────┬──────────────────────────────────────────────┘
                │ chrome.runtime.sendMessage("start_preview")
                ▼
┌──────────────────────────────────────────────────────────────┐
│ Service Worker（background）= 仮想 Web サーバー               │
│  ├─ message handler : start_preview を受け、セッションを生成  │
│  │                    chrome.storage.session に保存 → タブを開く│
│  ├─ fetch interceptor: preview/ 配下の fetch を横取り          │
│  │     1) URL → 相対パス抽出（path-resolver）                 │
│  │     2) Cache API 参照（cache）                             │
│  │     3) miss なら Drive API で fileId 解決＋取得（drive-api）│
│  │     4) Content-Type 付与（content-type）→ Response 返却     │
│  └─ auth: chrome.identity でトークン取得（auth）              │
└───────────────┬──────────────────────────────────────────────┘
                │ Drive API（OAuth トークン）
                ▼
        Google Drive（files.list / files.get?alt=media）
```

## 3. レイヤーと責務

| レイヤー | モジュール | 責務 |
|----------|-----------|------|
| UI | `content/content-script.ts` | Drive 画面にボタン注入、`fileId` / `parentId` 取得 |
| UI | `popup/` | 認証状態の表示、手動でのプレビュー起動 |
| UI | `options/` | キャッシュ設定・既定動作 |
| サーバー | `background/service-worker.ts` | メッセージ受信・fetch インターセプト・ルーティング |
| ドメイン | `lib/drive-api.ts` | `files.list` / `files.get`、同名ファイル解決 |
| ドメイン | `lib/path-resolver.ts` | 相対パス → フォルダ階層を辿って `fileId` に解決 |
| ドメイン | `lib/content-type.ts` | 拡張子 / mimeType → `Content-Type` |
| ドメイン | `lib/cache.ts` | Cache API の読み書き・無効化 |
| 基盤 | `lib/auth.ts` | `chrome.identity` による OAuth トークン |
| 基盤 | `lib/session-state.ts` | `chrome.storage.session` への状態保存・復元 |
| 型 | `types/` | DriveFile / message / preview セッション |

## 4. 主要データフロー

### 4.1 プレビュー開始

1. ユーザーが Drive 上で `index.html` を選び、注入されたボタンをクリック
2. content-script が `fileId` / `parentId` / `fileName` を取得し、`start_preview` を background へ送信
3. background が `PreviewSession`（`sessionId`・`rootFolderId`・`entryFileName`）を生成し `chrome.storage.session` に保存
4. background が `chrome-extension://<id>/preview/<sessionId>/index.html` を新規タブで開く

### 4.2 リソース取得（fetch インターセプト）

1. タブがエントリ HTML をリクエスト → SW の `fetch` リスナが横取り
2. URL から `sessionId` と相対パス（`index.html`、`css/style.css` 等）を抽出
3. `cache` を参照。ヒットすれば即返却
4. miss の場合 `path-resolver` が `rootFolderId` を起点に相対パスを辿って `fileId` を特定（`drive-api.findFile`）
5. `drive-api.getMedia(fileId)` でバイト列を取得し `cache` に保存
6. `content-type` で `Content-Type` を決定し `Response` を生成して返却
7. ブラウザがレンダリング中に参照する後続リソースも 1〜6 を繰り返す

## 5. Manifest V3 制約への対応方針

- Service Worker は数分でスリープしグローバル変数が消える → 永続が必要な状態は **`chrome.storage.session`** に保存（詳細は `SERVICE_WORKER.md`）
- `fetch` / `onMessage` リスナは SW トップレベルで同期登録する
- OAuth は `chrome.identity` でブラウザ内完結（クライアントシークレット不要）

## 6. セキュリティ / プライバシー方針

- ファイル内容・トークン・ID を拡張外サーバーへ送信しない（通信先は Google API のみ）
- `permissions` / `host_permissions` / OAuth スコープは最小限（閲覧 `drive.readonly` 相当）
- 詳細は `SECURITY.md`

## 7. 関連ドキュメント

`SERVICE_WORKER.md` / `DRIVE_API.md` / `AUTH.md` / `PATH_RESOLUTION.md` / `CONTENT_TYPE.md` / `CACHE.md` / `UI.md` / `SECURITY.md` / `TESTING.md`
