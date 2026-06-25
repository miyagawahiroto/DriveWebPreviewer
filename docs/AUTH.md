# AUTH - 認証（chrome.identity / OAuth）

`lib/auth.ts` の責務と OAuth 方針を定義する。トークンはブラウザ内に閉じ、外部サーバーへ送信しない。

## 1. 方針と背景（getAuthToken からの移行）

当初は `chrome.identity.getAuthToken` を使っていたが、Google が 2023 年 10 月に導入した
**OAuth カスタム URI スキーム制限**により、`getAuthToken` 経由のサインインが

```
エラー 400: invalid_request
Custom URI scheme is not supported on Chrome apps.
flowName=GeneralOAuthFlow
```

で失敗するケースが発生する。とくに **Google Chrome 以外の Chromium 系ブラウザ
（Brave / Edge / Arc / Vivaldi 等）** では独自のカスタム URI スキームが付与され、Google に拒否されて恒久的に失敗する。これはトークンキャッシュ削除・アプリ連携削除・再インストールといった**どのリセット操作でも解消しない**。

そのため、認証を **`chrome.identity.launchWebAuthFlow`（implicit flow）** に移行する。これは
Chrome 以外の Chromium ブラウザでも動作し、クライアントシークレットを必要としない。

### 方式の選択（implicit flow）

| 候補 | 採否 | 理由 |
|------|------|------|
| `getAuthToken` | 不採用 | カスタム URI スキーム制限で 400 invalid_request。Chrome 限定 |
| `launchWebAuthFlow` + 認可コード + PKCE | 不採用 | Google の「ウェブ アプリケーション」型クライアントはトークン交換に **client_secret 必須**。拡張にシークレットを同梱できない（CLAUDE.md 禁止事項） |
| **`launchWebAuthFlow` + implicit flow（`response_type=token`）** | **採用** | アクセストークンをリダイレクトのフラグメントで直接受け取れ、**client_secret 不要**。各種 Chromium ブラウザで動作 |

implicit flow にはリフレッシュトークンが無く、アクセストークンは約 1 時間で失効する。失効後は
`getToken(false)`（サイレント再取得 `prompt=none`）→ 失敗時 `getToken(true)`（同意/再認証）で取り直す。

> **将来の検討**: implicit flow（`response_type=token`）は OAuth 2.0 / 2.1 で非推奨化が進む方向のため、
> 長期的には **認可コード ＋ PKCE（`response_type=code` ＋ `code_challenge`、client_secret 不要）** への
> 移行を検討する。現時点では単純さを優先して implicit flow を採用している。

## 2. スコープ

| スコープ | 用途 |
|----------|------|
| `https://www.googleapis.com/auth/drive.readonly` | Drive ファイルの検索・閲覧（読み取り専用） |

「Web プレビュー」ボタンで現在開いているフォルダ ID から即プレビューするため `drive.readonly` を使う（`PICKER.md` の経緯参照）。restricted スコープのため一般公開時は CASA が必要。スコープ追加・変更は人間が判断する（CLAUDE.md）。

## 3. OAuth クライアントとリダイレクト URI

`launchWebAuthFlow` では Google Cloud Console で **「ウェブ アプリケーション(Web application)」型**の
OAuth クライアント ID を作成する（旧来の「Chrome 拡張機能」型ではない）。

- **承認済みのリダイレクト URI** に、拡張の `chrome.identity.getRedirectURL()` が返す値
  `https://<拡張機能ID>.chromiumapp.org/` を登録する。
- クライアント ID は拡張機能 ID に紐づく公開値のため**コミット可**（`lib/auth.ts` の `OAUTH_CLIENT_ID` 定数）。**クライアントシークレットは記載しない・使わない**。
- マニフェストの `oauth2` フィールドは `getAuthToken` 専用のため**不要**（削除する）。
- 詳細な作成手順は `SETUP_OAUTH.md` を参照。

## 4. トークンの保持

`getAuthToken` は内部でトークンをキャッシュしていたが、`launchWebAuthFlow` は都度フローを開くため、
**取得したアクセストークンと失効時刻を自前でキャッシュ**する。

- 保存先: **`chrome.storage.session`**（MV3 の SW スリープ復帰後も再利用できる。タブ/ブラウザを閉じると消える＝永続化しない）
- 保存内容: `{ accessToken, expiresAt }`（`expiresAt` は epoch ミリ秒）
- `expires_in`（フラグメント値、無ければ 3600 秒）に対し**安全マージン 60 秒**を引いて有効判定する
- 平文での `chrome.storage.local` 永続保存・ログ出力・外部送信は禁止（6 節）

## 5. API

```
getToken(interactive = false): Promise<string>
```

- 有効なキャッシュトークンがあればそれを返す
- 無ければ `launchWebAuthFlow` を実行してアクセストークンを取得し、キャッシュして返す
- `interactive: false` のときは認可 URL に `prompt=none` を付け、UI を出さずに（既存セッションがあれば）サイレント取得する。取得できなければ reject
- `interactive: true` のときは必要に応じてアカウント選択・同意画面を表示する

> **対話的取得の起動場所**: `interactive: true` は、popup の「サインイン」ボタンと、
> background の `start_preview`（`ensureToken()` 経由で初回のみ同意）から呼ぶ。「Web プレビュー」
> 押下→（初回のみ同意）→表示、という 1 クリック動線のため、background でも初回の同意を出す。

```
invalidate(token): Promise<void>
```

- キャッシュ中のトークンが渡されたトークンと一致（または不明）なら、キャッシュを破棄する
- 401 を受けた `drive-api` がこれを呼んでから 1 度だけ `getToken(false)`（サイレント再取得）で取り直す

```
signOut(): Promise<void>
```

- キャッシュトークンを破棄する（ローカルのサインアウト相当）。次回 `getToken` で再取得になる
- Google 側のアプリ許可は残るため、初回同意画面まで再現したい場合は併せて
  `myaccount.google.com/connections` でアクセスを削除する

```
isSignedIn(): Promise<boolean>
```

- `getToken(false)` が成功するかで判定（popup の状態表示用）。UI は出さない

## 6. トークン取り扱いの禁止事項

- `console.log` 等でトークンを出力しない
- `chrome.storage.local` など永続ストレージへ平文保存しない（再利用は `chrome.storage.session` のみ）
- 拡張外への送信禁止（通信先は Google API および OAuth エンドポイントのみ）

## 7. 関連

`DRIVE_API.md` / `SECURITY.md` / `SETUP_OAUTH.md`
