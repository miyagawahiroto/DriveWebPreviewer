# AUTH - 認証（chrome.identity / OAuth）

`lib/auth.ts` の責務と OAuth 方針を定義する。

## 1. 方針

- **`chrome.identity.getAuthToken`** を用い、クライアントシークレット不要の方式で OAuth トークンを取得する
- トークンはブラウザ内に閉じ、**外部サーバーへ送信しない**
- スコープは閲覧用の最小限とする

## 2. スコープ

| スコープ | 用途 |
|----------|------|
| `https://www.googleapis.com/auth/drive.readonly` | Drive ファイルの検索・閲覧（読み取り専用） |

将来 `drive.file`（アプリが開いたファイルのみ）への絞り込みを検討する。スコープ追加・変更は人間が判断する（CLAUDE.md）。

## 3. manifest.json での宣言

```jsonc
"oauth2": {
  "client_id": "<OAuth クライアント ID（公開値・コミット可）>",
  "scopes": ["https://www.googleapis.com/auth/drive.readonly"]
}
```

`client_id` は拡張機能 ID に紐づく公開値のためコミット可。**クライアントシークレットは記載しない**。

## 4. API

```
getToken(interactive = false): Promise<string>
```

- `chrome.identity.getAuthToken({ interactive })` をラップ
- 非対話（`interactive: false`）を基本とし、未認証時のみ `interactive: true` で同意フローを出す
- 取得したトークンを返す（永続ストレージへは保存しない）

```
ensureToken(): Promise<string>
```

- 非対話で取得を試み、失敗したら対話的サインイン（同意画面）にフォールバックする
- **プレビュー操作（ユーザー操作起点）から呼ぶ**ことで、「プレビューを押す → 必要なら Google ログイン同意 → 表示」という最短動線を実現する
- これによりエンドユーザーの操作は実質「インストール＋初回の Google ログインのみ」になる（クライアント ID 等の設定はユーザーに不要）

```
invalidate(token): Promise<void>
```

- `chrome.identity.removeCachedAuthToken({ token })` を呼び、失効トークンをキャッシュから除去
- 401 を受けた `drive-api` がこれを呼んでから 1 度だけ再取得する

```
isSignedIn(): Promise<boolean>
```

- `getToken(false)` が成功するかで判定（popup の状態表示用）

## 5. トークン取り扱いの禁止事項

- `console.log` 等でトークンを出力しない
- `chrome.storage.local` など永続ストレージへ平文保存しない
- 拡張外への送信禁止（通信先は Google API のみ）

## 6. 関連

`DRIVE_API.md` / `SECURITY.md`
