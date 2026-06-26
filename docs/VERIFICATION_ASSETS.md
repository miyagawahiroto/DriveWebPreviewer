# VERIFICATION_ASSETS - OAuth 検証 / CASA 提出用の素材

一般公開（外部＋本番＋`drive.readonly`）の OAuth 検証および CASA で提出する文章・動画の素材をまとめる。Google Cloud Console の検証フォーム・CASA 申請にそのまま転用できるよう、英語版も併記する。

> 提出は人間（管理者）が行う。本書は文面のたたき。確定前に**実際のアプリ挙動と齟齬がないか**を必ず確認すること（審査では動画と説明の一致が見られる）。関連: `CASA.md` / `DISTRIBUTION.md` / `PRIVACY.md`。

---

## 1. アプリ概要（検証フォームの説明欄用）

**日本語**
> DriveWebPreviewer は、利用者の Google Drive 上に置かれた HTML/CSS/JavaScript/画像で構成された Web ページを、外部サーバーにデータや権限を渡すことなく、ブラウザ拡張機能内で直接レンダリングしてプレビューする Chrome 拡張機能です。取得したファイルとアクセストークンはすべてブラウザ内（Service Worker / chrome.identity / chrome.storage）で完結し、Google API 以外の外部に送信されません。

**English**
> DriveWebPreviewer is a Chrome extension that renders and previews web pages (HTML/CSS/JavaScript/images) stored in the user's Google Drive, directly inside the browser, without sending any data or access to external servers. All fetched files and access tokens stay within the browser (Service Worker / chrome.identity / chrome.storage) and are never transmitted anywhere other than Google APIs.

---

## 2. スコープ利用目的（restricted スコープの正当化）

要求スコープ: `https://www.googleapis.com/auth/drive.readonly`

### 2.1 なぜこのスコープが必要か

**日本語**
> 本拡張の中核機能は「Drive 上の Web ページをそのまま表示する」ことです。1 つの HTML はしばしば同フォルダ内の CSS・JavaScript・画像・サブフォルダ内アセットを相対パスで参照します。プレビューを成立させるには、ユーザーが指定したフォルダ配下のこれらの関連ファイルを**読み取って**ブラウザに返す必要があります。書き込み・変更・削除は一切行わないため、**読み取り専用の `drive.readonly`** を要求します。取得は表示のためだけに使用し、外部に送信しません。

**English**
> The extension's core function is to render web pages stored in Drive as-is. A single HTML file typically references CSS, JavaScript, images, and sub-folder assets via relative paths. To render the preview correctly, the extension must **read** these related files under the user-specified folder and return them to the browser. It never writes, modifies, or deletes anything, so it requests the **read-only** `drive.readonly` scope. The data is used solely for rendering and is never sent externally.

### 2.2 narrower スコープを使わない理由

**日本語**
> プレビュー対象の HTML は任意の相対パス（例: `assets/img/logo.png`、`../shared/base.css`）で多数のファイルを参照し、参照先は実行前には確定しません。`drive.file` ではユーザーが Picker で個別選択したファイルしか扱えず、HTML が動的に参照する関連ファイル群を解決できないため、フォルダ配下を読み取れる `drive.readonly` が必要です。（将来的な `drive.file` ＋ Picker 方式の検討経緯は `PICKER.md`。）

**English**
> A previewed HTML page references many files via arbitrary relative paths (e.g., `assets/img/logo.png`, `../shared/base.css`) that cannot be enumerated before execution. With `drive.file`, only files individually chosen via the Picker are accessible, which cannot resolve the related assets an HTML page references dynamically. Therefore `drive.readonly`, which can read files under the folder, is required.

### 2.3 データ取り扱いの要約（Limited Use）

**日本語 / English**
> 取得データは利用者のブラウザ内のみで処理され、開発者を含む外部サーバーへ送信しません。広告利用・販売・人による閲覧は行いません（`PRIVACY.md` の Limited Use 条項に準拠）。
> Fetched data is processed only within the user's browser and is never sent to any external server, including the developer's. It is not used for advertising, sold, or read by humans (compliant with the Limited Use terms in `PRIVACY.md`).

---

## 3. デモ動画 台本

検証で求められる動画の要件（一般的な目安。最新要件は Google のメール指示に従う）：

- OAuth 同意画面（要求スコープが見える状態）を含める
- そのスコープを**実際に使う操作**を、申請したクライアント ID／本番ドメインで示す
- 拡張機能名が分かるようにする
- 音声ナレーション or 字幕で各ステップを説明（英語推奨。日本語＋英字幕でも可）

### 3.1 収録手順（チェックリスト）

- [ ] 本番（公開版）拡張を Chrome にインストールした状態にする
- [ ] サインイン済みなら一旦サインアウトし、初回同意画面を再現できる状態にする（`SETUP_OAUTH.md` 7.5）
- [ ] 画面録画を開始（拡張アイコン／拡張名が映るように）
- [ ] 下記シーンを順に実演
- [ ] 録画を YouTube 限定公開などにアップロードし URL を申請に添付

### 3.2 シーン構成（ナレーション台本）

| # | 画面 | ナレーション（日本語） | Narration (English) |
|---|------|----------------------|---------------------|
| 1 | 拡張のストア掲載 or アイコン | 「これは Chrome 拡張 DriveWebPreviewer です。Google Drive 上の Web ページをブラウザ内でプレビューします。」 | "This is the Chrome extension DriveWebPreviewer. It previews web pages stored in Google Drive, inside the browser." |
| 2 | Drive で対象フォルダを開く（`.../folders/<ID>`、`index.html` を含む） | 「index.html と関連する CSS・画像が入った Drive フォルダを開きます。」 | "I open a Drive folder containing index.html and its related CSS and images." |
| 3 | 「Web プレビュー」ボタンをクリック | 「拡張が注入した『Web プレビュー』ボタンを押します。」 | "I click the 'Web Preview' button injected by the extension." |
| 4 | Google 同意画面（`drive.readonly` が表示） | 「初回のみ Google の同意画面が表示されます。ここで読み取り専用スコープ drive.readonly を要求します。許可します。」 | "On first use, Google's consent screen appears, requesting the read-only scope drive.readonly. I grant it." |
| 5 | 新規タブでページが描画される | 「拡張がフォルダ内のファイルを読み取り、ブラウザ内でページとして表示します。CSS と画像、サブフォルダの相対パスも解決されています。」 | "The extension reads the files in the folder and renders the page in the browser. CSS, images, and sub-folder relative paths are all resolved." |
| 6 | （任意）開発者ツール Network / 設定画面 | 「通信先は Google API のみで、ファイルや権限を外部サーバーに渡しません。設定からサインアウトできます。」 | "Network requests go only to Google APIs; no files or access are sent to external servers. The user can sign out from settings." |

> 動画の長さは 1〜3 分程度を目安に、同意画面とスコープ利用シーンを必ず収める。

---

## 4. 提出時に添付する URL 一覧

| 項目 | 値 |
|------|-----|
| プライバシーポリシー URL | （`PRIVACY.md` を公開して URL 化） |
| アプリのホームページ URL | （GitHub リポジトリ等） |
| デモ動画 URL | （YouTube 限定公開等） |
| 承認済みドメイン（所有権確認済み） | （ポリシー/ホームページのドメイン） |

---

## 5. 関連

`CASA.md` / `DISTRIBUTION.md` / `PUBLISHING.md` / `PRIVACY.md` / `SETUP_OAUTH.md` / `PICKER.md`
