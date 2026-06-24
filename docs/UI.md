# UI - コンテンツスクリプト / ポップアップ / 設定

`content/` `popup/` `options/` の責務を定義する。

## 1. content-script（Drive 画面への注入）

対象: `https://drive.google.com/*`

責務:

- Drive のファイル一覧 / プレビュー画面に「Web プレビュー」ボタンを注入する
- ユーザーが対象 HTML を選択した状態でボタンを押すと、`fileId` / `parentId`（親フォルダ ID）/ `fileName` を取得し、`start_preview` メッセージを background へ送る

### プレビュー対象の取得（2 つの導線）

Drive の URL は「フォルダを開く」と「ファイルを開く」で形が異なり、両方には対応しない：

1. **フォルダを開いている**（URL: `/folders/<folderId>`）→ `parentId = folderId`、エントリは `index.html` と仮定して送る
2. **ファイルを開いている**（URL: `/file/d/<fileId>/`）→ `fileId` のみ送り、**親フォルダ ID とファイル名は background が Drive API（`files.get` の `parents` / `name`）で逆引き**する

どちらも取得できない場合のみ、ユーザーに「フォルダまたはファイルを開いた状態で実行」するよう促す。

> Drive の DOM 構造は変化しうるため、選択中アイテムの DOM 属性（`data-id` 等）からの取得は将来のフォールバックとして追加検討する。

注入する DOM・取得ロジックは Drive 側の変更に弱いため、`docs/` とコードコメントに「壊れたらここを直す」ポイントを明記する。

## 2. popup

責務:

- 認証状態の表示（`auth.isSignedIn()`）と、未認証時のサインインボタン（`getToken(true)`）
- 現在 Drive ファイルページを開いていれば、そこからのプレビュー起動導線
- 設定ページへのリンク

## 3. options（設定ページ）

責務:

- キャッシュの削除（`cache.clearAll()`）
- 既定動作の設定（同名解決の優先キー＝更新日時/作成日時、キャッシュ有効/無効 等）
- 設定は `chrome.storage.local`（機密でない設定値のみ）に保存

## 4. メッセージ種別（`types/message.ts`）

| 種別（`snake_case`） | 方向 | ペイロード |
|---------------------|------|-----------|
| `start_preview` | content/popup → background | `{ fileId, parentId, fileName }` |
| `auth_required` | background → popup | `{ }` |
| `get_auth_state` | popup → background | `{ }` |
| `auth_state` | background → popup | `{ signedIn: boolean }` |

## 5. 関連

`SERVICE_WORKER.md` / `AUTH.md`
