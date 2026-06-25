# SETUP_OAUTH - 実 Drive をローカルで確認するための OAuth 設定（開発者の一度きり）

実際の Google Drive のファイルをプレビューするには、Google の認可（OAuth）が必要。これは「ユーザーの Drive を読む」ために避けられない。**この設定は開発者が一度だけ行う作業**で、エンドユーザーには不可視（ユーザーはログインするだけ）。

> CLAUDE.md のルール上、Google Cloud Console の操作と `client_id` 実値の入力は**人間（管理者）が行う**。AI はこの手順書の作成と manifest の差し替え補助までを担当する。

## 0. 前提

- Google アカウント
- 対象の Drive フォルダに `index.html`（＋必要なら `style.css` / `assets/` 等）を配置済み

## 1. 拡張機能を一度読み込んで「拡張機能 ID」を確認

```bash
npm run build
```

1. Chrome で `chrome://extensions` を開く
2. 右上「デベロッパーモード」を ON
3. 「パッケージ化されていない拡張機能を読み込む」で `dist/` を選択
4. 表示されたカードの **ID**（32文字）をメモする

> unpacked の ID は `dist/` の絶対パスから決まるため、**同じ場所から読み込む限り変わらない**。フォルダを移動・別マシンに持っていく場合のみ、後述の「ID 固定（key）」が必要。

## 2. Google Cloud で Drive API を有効化（人間）

1. https://console.cloud.google.com/ でプロジェクトを作成または選択
2. 「API とサービス」→「ライブラリ」→ **Google Drive API** →「有効にする」

> **重要（取り違え注意）**: 以下の 3 つは**すべて同一の GCP プロジェクト**で行うこと。
> - Drive API の有効化（手順 2）
> - OAuth 同意画面 / データアクセス（手順 3）
> - OAuth クライアント ID（手順 4）
>
> 別プロジェクトに分かれていると、「違うアカウントに連携されているように見える」「`myaccount.google.com/connections` に出ない」「認証は通るがデータにアクセスできない」といった不整合が起きる。
> client_id の先頭の数字は**プロジェクト番号**なので、これで所属プロジェクトを判別できる。画面右上のプロジェクト選択が常に目的のプロジェクトになっているか確認する。

## 3. OAuth 同意画面の設定（人間）

「API とサービス」→「OAuth 同意画面」を開く。現在は **「Google Auth Platform」** という新 UI で、
**ブランディング / 対象(Audience) / データアクセス(Data access) / クライアント(Clients)** に分かれている。
初回は「**始める(Get started)**」から初期設定を行う。

> **User Type は通常「外部(External)」を選ぶ**。「内部(Internal)」は Google Workspace 組織がある場合のみ選択可。
> 個人 Google アカウントでは「内部」は使えないため「外部＋テスト」で進める（テストユーザーに自分を追加すれば審査不要で利用可）。

初回セットアップで入力する項目：

- **アプリ情報**: アプリ名、ユーザーサポートメール
- **対象(Audience)**: 外部(External)
- **連絡先**: 開発者メール

作成後、各セクションで以下を設定：

1. **ブランディング**: アプリ名・サポートメール（初回で入力済みなら確認のみ）
2. **データアクセス**:「スコープを追加または削除」→「手動でスコープを追加」に
   `https://www.googleapis.com/auth/drive.readonly` を貼り付け →「テーブルに追加」→「更新」→「保存」
   （restricted スコープのため一覧に出にくい。手動追加が確実）
3. **対象**:「テストユーザー」に自分の Google アカウント（Gmail）を追加（公開申請は不要）

## 4. OAuth クライアント ID を作成（人間）

> **重要（方式変更）**: 認証は `chrome.identity.getAuthToken` から **`chrome.identity.launchWebAuthFlow`** に移行した（Google の OAuth カスタム URI スキーム制限により getAuthToken は Chrome 以外で 400 invalid_request になるため。詳細は `AUTH.md`）。これに伴い、OAuth クライアントの種類は **「Chrome 拡張機能」ではなく「ウェブ アプリケーション(Web application)」** を作成する。

まず拡張のリダイレクト URI を確認する。これは拡張機能 ID から決まり、

```
https://<拡張機能ID>.chromiumapp.org/
```

の形（拡張のコードでは `chrome.identity.getRedirectURL()` が返す値）。手順 1 でメモした ID を当てはめる。

「Google Auth Platform」→「**クライアント(Clients)**」→「**クライアントを作成**」
（旧 UI では「API とサービス」→「認証情報」→「認証情報を作成」→「OAuth クライアント ID」）

1. アプリケーションの種類: **ウェブ アプリケーション(Web application)**
2. **承認済みのリダイレクト URI** に、上記 `https://<拡張機能ID>.chromiumapp.org/` を追加（末尾スラッシュ込み）
3. 作成すると `xxxxx.apps.googleusercontent.com` 形式の **クライアント ID** が発行される。これをコピー
   - **クライアントシークレットは使わない**（implicit flow のため不要。コードにも含めない）

## 5. クライアント ID をビルドに設定して再ビルド

クライアント ID は `manifest.json` ではなく **`.env.local`（git 管理外）** から `build.mjs` 経由でコードに注入する（dev / release で別クライアント）。

`.env.local` に追記：

```bash
# 開発（unpacked）用クライアント ID
DWP_DEV_CLIENT_ID=あなたのdevクライアントID.apps.googleusercontent.com
# 公開（ストア）ビルド用クライアント ID（npm run package / build --release で使用）
DWP_RELEASE_CLIENT_ID=あなたの公開用クライアントID.apps.googleusercontent.com
```

```bash
npm run build
```

`chrome://extensions` で拡張機能カードの「更新（リロード）」ボタンを押す。

> `DWP_DEV_CLIENT_ID` 未設定のままビルドするとサインインに失敗する（ビルド時に警告が出る）。

## 6. 動作確認

1. Drive で、`index.html` を含む**フォルダを開く**（URL が `.../folders/<親フォルダID>` になる）

   > 現在の content-script は URL から親フォルダ ID を取得し、エントリを `index.html` と仮定する。任意ファイル名・選択アイテムからの取得は今後の拡張（docs/UI.md）。
2. 画面右下の「**Web プレビュー**」ボタンをクリック
3. 初回は **Google ログインの同意画面**が出る → 許可
4. 新規タブにページが表示され、CSS・画像・サブフォルダの相対パスが解決されることを確認

## 7. うまくいかないとき

| 症状 | 原因・対処 |
|------|-----------|
| `Error 400: invalid_request` / `Custom URI scheme is not supported on Chrome apps` / `flowName=GeneralOAuthFlow` | 旧方式（getAuthToken）の名残、または「Chrome 拡張機能」型クライアントを使っている。**「ウェブ アプリケーション」型クライアント**を作り（手順 4）、`DWP_DEV_CLIENT_ID` を設定して再ビルド。`AUTH.md` 参照 |
| `redirect_uri_mismatch` | クライアントの「承認済みのリダイレクト URI」が `https://<拡張機能ID>.chromiumapp.org/`（末尾スラッシュ込み）と一致していない |
| `bad client id` / 認証が即失敗 | `DWP_DEV_CLIENT_ID`（または release は `DWP_RELEASE_CLIENT_ID`）が未設定・誤り |
| `access_denied` | 同意画面のテストユーザーに自分を追加したか、スコープ `drive.readonly` が設定されているか |
| 認証後も 404 | フォルダを開いた状態で実行したか（親フォルダ ID が URL から取れているか）。`index.html` がそのフォルダ直下にあるか |
| ある日突然 ID が変わった | `dist/` の場所を変えた／別パスから読み込んだ。下記「ID 固定」を検討 |

## 7.5 認証をリセットして「初回認証」を再現する

一度許可するとトークンがキャッシュされ、Google 側も許可を記憶するため、初回の同意フローはそのままでは再現されない。再現には次の 2 段階を行う：

| 再現したいもの | 操作 |
|---------------|------|
| **トークン取得のやり直し**（アカウント選択程度） | 拡張機能の**設定ページ →「サインアウト（トークン解除）」**（`chrome.storage.session` のキャッシュトークンを破棄）|
| **初回の同意画面まで完全再現** | 上記に加えて、[Google アカウントのアプリ連携](https://myaccount.google.com/connections) で本アプリの**アクセスを削除** |

その後にポップアップからサインイン、または「Web プレビュー」を実行すると、`getToken(true)` 経由で同意画面が再表示される（`AUTH.md`）。

## 8. 補足: dev の拡張機能 ID を固定したい場合（`DWP_DEV_KEY`）

unpacked の拡張機能 ID は読み込みパスから決まるため、**同じ場所から読み込む限りは変わらない**。別マシンでも同じ ID にしたい、`redirect_uri_mismatch` の再登録を避けたい場合は、dev 専用の公開鍵 `key` を入れて ID を固定できる。

> **PROD とは別の鍵にすること**。release は build.mjs の公開版鍵（`DEFAULT_RELEASE_KEY` / `DWP_RELEASE_KEY`）で ID を `jgebf…` に固定する。dev に同じ鍵を使うと **DEV と PROD の ID が衝突**するため、dev は専用鍵にして ID を分ける。

### 8.1 dev 用の鍵ペアを生成

```bash
# 秘密鍵（.env.local と同様、git にコミットしない。安全に保管）
openssl genrsa 2048 | openssl pkcs8 -topf8 -nocrypt -out dev-key.pem
# manifest.key 用の公開鍵（base64・1 行）。この出力を控える
openssl rsa -in dev-key.pem -pubout -outform DER 2>/dev/null | base64 | tr -d '\n'; echo
```

### 8.2 `.env.local` に設定して再ビルド

```bash
DWP_DEV_KEY=<上で出力された base64 公開鍵（1 行）>
```

```bash
npm run build
```

これで dev ビルド（`npm run build` / `npm run dev`）の `manifest.key` に dev 用鍵が注入され、ID が固定される（PROD とは異なる ID）。release（`--release`）は引き続き公開版鍵を使う。

### 8.3 dev の ID とリダイレクト URI を確認・登録

`chrome://extensions` でリロード後、Service Worker コンソールで

```js
chrome.identity.getRedirectURL()
```

を実行し、出た `https://<dev-id>.chromiumapp.org/` を **dev 用 OAuth クライアント（`DWP_DEV_CLIENT_ID`）の「承認済みのリダイレクト URI」** に登録する（末尾スラッシュ込み・完全一致）。以後 dev の ID は固定なので再登録は不要。

## 9. 公開後（ウェブストア）

ウェブストアに公開すると拡張機能 ID は**永続的に固定**される。OAuth クライアントの登録は同様に必要だが、`key` の手動管理は不要になり、エンドユーザーは「インストール＋ログイン」だけで利用できる。

## 関連

`AUTH.md` / `SECURITY.md` / `DEMO.md`
