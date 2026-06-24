# UI - コンテンツスクリプト / ポップアップ / 設定

`content/` `popup/` `options/` の責務を定義する。

## 1. content-script（Drive 画面への注入）

対象: `https://drive.google.com/*`

責務:

- Drive のファイル一覧 / プレビュー画面に「Web プレビュー」ボタンを注入する
- ユーザーが対象 HTML を選択した状態でボタンを押すと、`fileId` / `parentId`（親フォルダ ID）/ `fileName` を取得し、`start_preview` メッセージを background へ送る

### プレビュー対象の取得（優先順位）

content-script は次の優先順位で対象を決める：

1. **ファイルを開いている**（URL: `/file/d/<fileId>/`）→ `fileId` を送る → **そのファイル単体**をプレビュー
2. **フォルダ表示で特定ファイルを選択中**（DOM の `[aria-selected="true"]` 配下の `data-id`）→ その `fileId` を送る → **選択ファイル単体**（`index.html` 以外でも）
3. **フォルダのみ**（URL: `/folders/<folderId>`）→ `parentId` を送り、エントリは `index.html` と仮定

`fileId` がある場合、親フォルダ ID とファイル名は background が Drive API（`files.get` の `parents` / `name`）で逆引きし、相対パスはそのファイルの親フォルダ基準で解決する。

> 選択中アイテムの DOM 取得（2）は Drive の DOM 構造に依存するため壊れやすい。取得できない場合は 1・3 にフォールバックする。最も確実なのは「ファイルを開いて実行」（1）。

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
