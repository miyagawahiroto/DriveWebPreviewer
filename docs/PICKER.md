# PICKER - drive.file ＋ Google Picker 方式（採用見送り・経緯の記録）

> **【重要】この方式は採用していません（2026-06 時点）。**
> 一般公開の審査（CASA）を避けるため `drive.file` ＋ Google Picker を検討したが、MV3 では Picker を
> **外部の実 https オリジン（Firebase Hosting）でホストする必要**があり、その外部ページへ OAuth トークンを
> 渡すことになる。**「トークンも含め一切外部を経由させない」方針を優先**し、本方式は**採用を見送った**。
> 現行は **`drive.readonly` ＋ content-script の「Web プレビュー」1 クリック**（`AUTH.md` / `UI.md`）。
> 一般公開時は restricted スコープのため **CASA を受け入れる**前提。
> 以下は将来再検討する場合のための設計記録（Firebase Hosting・サイト・関連コードは撤去済み）。

一般公開時の審査を軽くするため、スコープを `drive.readonly`（restricted）から **`drive.file`（recommended）** に変更し、フォルダ選択を **Google Picker** で行う方式の仕様。`DISTRIBUTION.md` / `PUBLISHING.md` の Phase 2 に対応する。

## 1. なぜこの方式か

- `drive.file` は「ユーザーが Picker で明示的に選んだファイル/フォルダ」のみにアクセスする最小権限スコープ。一般公開時に **CASA（年次セキュリティ評価）が不要**で審査が軽い。
- **フォルダを Picker で選ぶと、その配下（サブフォルダ含む）にアクセスできる**ため、相対パス解決（本機能の核）は維持できる。

## 2. 必要な認証情報（人間が GCP で用意）

| 種別 | 用途 | 備考 |
|------|------|------|
| OAuth クライアント ID（Chrome 拡張機能） | サインイン・トークン取得 | 既存（`SETUP_OAUTH.md`）。スコープを `drive.file` に変更 |
| **API キー** | Google Picker の `setDeveloperKey` | 新規作成。Picker API を有効化し発行。`manifest` には入れずビルド時注入。公開拡張では完全秘匿不可のため、**API の制限（Picker API のみ）で防御する** |
| AppId（プロジェクト番号） | Picker の `setAppId` | `162512121004` |

> API キーは制限付き（Picker/Drive API のみ、参照元制限）にして最小化する。スコープ変更・API 有効化は人間が行う（CLAUDE.md）。

## 3. MV3 制約と構成

MV3 は拡張ページでの外部スクリプト実行を禁止するため、Picker（`https://apis.google.com/js/api.js` 依存）を**サンドボックスページ**で動かす。

```
[popup/content] --(open)--> [picker/picker.html（sandbox）]
      |                           |  apis.google.com を読み込み Picker 表示
      |  postMessage(token,key)   |
      |-------------------------->|
      |                           |  ユーザーがフォルダ/ファイルを選択
      |  postMessage(selection)   |
      |<--------------------------|
      v
[background] start_preview(folderId / fileId) で従来どおりプレビュー
```

- `manifest.json` に `sandbox.pages` を追加し、Picker ページのみ外部スクリプト許可の CSP を与える
- サンドボックスは `chrome.*` / 拡張オリジンを持たないため、OAuth トークンは親（popup 等）から `postMessage` で渡す
- 選択結果（フォルダ ID・ファイル ID・名前）を親へ返し、`background` の `start_preview` に流す

## 4. 処理フロー

1. ユーザーが拡張アイコン（popup）→「フォルダを選んでプレビュー」
2. popup（または Picker host）が `auth.getToken(true)` でトークン取得（`drive.file` スコープ同意）
3. popup が Picker サンドボックスページを開き、トークン・API キー・AppId を渡す
4. Picker でフォルダ（またはファイル）を選択 → 選択情報が返る
5. `start_preview`（フォルダなら index.html、ファイルならそのファイル）→ 従来のプレビュー経路
6. 以後の Drive API 取得は、選択により付与された `drive.file` 権限で成功する

## 5. スコープ・既存コードへの影響

- `manifest.json`: `oauth2.scopes` を `https://www.googleapis.com/auth/drive.file` に変更
- `host_permissions`: Picker のため `https://apis.google.com/*` 等の追加要否を検証（サンドボックス CSP 側で許可）
- `drive-api.ts`: 呼び出し自体は不変（`files.list`/`files.get`/`alt=media`）。ただし**アクセスできるのは選択済みフォルダ配下のみ**
- content-script の「Drive 画面のボタン」起点は任意に。Picker 起点（popup）を主導線にする

## 6. 留意点

- `drive.file` では、Picker で選んでいないファイルにはアクセスできない（403）。必ずルートフォルダを選ばせる
- 後からフォルダに追加されたファイルへのアクセス可否は要検証（基本は選択フォルダ配下が対象）
- **API キーのアプリケーション制限（HTTP リファラー等）は「なし」が現状の正解**：
  - Picker は MV3 サンドボックスページ（オリジン null）で動くため、リファラー制限をかけると Picker が動かなくなる可能性が高い
  - 本来の防御は **API の制限（Picker API のみ）**。データアクセス権限なし・無課金のため、漏れても被害は「無料 Picker クォータの消費」程度
  - Picker 実装後に `chrome-extension://<拡張機能ID>/*` でのリファラー制限を**試し**、動作すれば締める（動かなければ「なし」に戻す）
  - 追加防御として Picker API のクォータ上限を低めに設定してもよい
- **postMessage の受け渡し先/元の限定**：OAuth トークンを host → picker で `postMessage(…, "*")` で渡すが、サンドボックスは opaque origin のため origin 検証は使えない。代わりに **`event.source` 一致チェック**で限定する：
  - host: 受信時に `event.source !== iframe.contentWindow` なら無視
  - picker: 受信時に `event.source !== window.parent` なら無視

## 6.5 実装状況（実装済み）

- `manifest.json`: スコープ `drive.file`、`sandbox.pages` に `picker/picker.html`、`content_security_policy.sandbox` を追加
- `src/picker/picker.html` + `picker.ts`: サンドボックスで Picker（`apis.google.com`）を表示し、選択結果を親へ postMessage
- `src/picker/host.html` + `host.ts`: 通常拡張ページ。`getToken(true)` でトークン取得 → サンドボックス iframe へ `dwp_init`（token / apiKey / appId）を渡す → 選択を受けて `start_preview`
- `background`: `open_picker` メッセージでホストタブを開く
- `popup` / `content-script`: 「フォルダを選んでプレビュー」「Web プレビュー」ボタン → `open_picker`
- API キー・AppId はビルド時注入（`__PICKER_API_KEY__` / `__GCP_PROJECT_NUMBER__`）

**検証結果（重要）**: 実機検証の結果、**サンドボックスページ方式では Picker は動作しない**ことが判明した（詳細・代替方式は「6.6」）。OAuth 同意画面のスコープは `drive.file` のみにする（`drive.readonly` は削除）。

## 6.6 改訂: サンドボックス方式は不可 → 外部ホスト（Firebase Hosting）方式へ

### なぜサンドボックス方式が動かないか

1. Picker は外部スクリプト（`apis.google.com`）を読むため、MV3 ではサンドボックスページにするしかない
2. サンドボックスは **origin が `null`（opaque）**。しかも**入れ子の iframe に伝播**するため、Picker が内部で開く `docs.google.com` の iframe も origin `null` になる
3. その結果、Picker 内部の XHR が `origin 'null'` から `docs.google.com` を叩き **CORS で全ブロック**される（「The API developer key is invalid」やフォルダ一覧が出ない症状）
4. 回避には sandbox に `allow-same-origin` が必要だが、**Chrome は拡張の manifest sandbox CSP で `allow-same-origin` を許可しない**（マニフェスト読み込み自体が失敗する）

→ 拡張内（`chrome-extension://` / サンドボックス）だけでは Picker を成立させられない。**唯一の実用解は「Picker ページを実 https オリジンにホストする」**こと。

### 採用方式: Firebase Hosting に Picker ページを置く

- Picker ページ（gapi 読み込み＋Picker 表示＋postMessage 返却）を **Firebase Hosting**（既存 GCP プロジェクトに Firebase を追加）に静的ページとして配信する。実 https オリジン（`https://<project>.web.app`）になるため、Picker 内部の通信が正常に動く。
- **バックエンドは持たない**（静的配信のみ）。OAuth トークンはブラウザ内に留まり、サーバーへ送信しない（プライバシー方針は維持）。
- **ホストするページ自体は環境非依存**（トークン・API キー・AppId は拡張側から `postMessage` で渡す）。ただし dev/prod で独立してデプロイ・検証できるよう、**同一 Firebase プロジェクト内に Hosting マルチサイト（targets）で `dev` / `prod` の 2 サイト**を作る（同じ `hosting/` の内容を両サイトへデプロイ）。

```
[拡張: picker/host.html（chrome-extension origin）]
        |  window.open("https://<project>.web.app/")   ← 最上位の別ウィンドウ（実オリジン）
        |  postMessage(dwp_init: token/apiKey/appId)
        v
[Firebase: index.html + picker.js]  apis.google.com で Picker 表示（CORS 正常）
        |  postMessage(dwp_picked: id/name/mimeType)  ← window.opener 経由
        v
[拡張] start_preview(folderId / fileId) で従来どおりプレビュー
```

- **iframe ではなく `window.open`（最上位の別ウィンドウ）で開く**。Picker は「自分を使うページが最上位」前提で origin を検証するため、拡張ページ内の iframe（入れ子）だと最上位＝拡張オリジンを基準にして `Incorrect origin value` で失敗する。別ウィンドウなら Firebase が最上位になり一致する。
- 実オリジン同士なので **postMessage の `origin` 検証が可能**になる（サンドボックス時の `event.source` 一致チェックから、`event.origin` 検証へ強化）。
  - ホストページ側: 受信は `https://<project>.web.app` のみ許可
  - Picker ページ側: 受信は `chrome-extension://…`（拡張オリジン）のみ許可
- **API キーのリファラー制限**は「なし」ではなく **`https://<project>.web.app/*` に限定**できる（実オリジンになったため、セキュリティを締められる）。

### リポジトリ構成・デプロイ

| パス | 役割 |
|------|------|
| `hosting/index.html` | Picker ページ本体（gapi 読み込み） |
| `hosting/picker.js` | Picker 表示・postMessage 連携ロジック |
| `firebase.json` | Firebase Hosting 設定（マルチサイト `dev`/`prod` の 2 ターゲット、`public: hosting`、`frame-ancestors` ヘッダ） |
| `.firebaserc` | デプロイ先 Firebase プロジェクト ID と `dev`/`prod` ターゲット ↔ サイト ID の対応 |
| `deploy/deploy-hosting.sh` | デプロイスクリプト（`dev`/`prod` を引数で指定） |

初回セットアップ（人間・Console + CLI）:

```bash
firebase login
# Firebase コンソール → Hosting → 「別のサイトを追加」で dev/prod 用サイトを2つ作成
#   例: dwp-picker（prod） / dwp-picker-dev（dev）
# .firebaserc にプロジェクト ID と各サイト ID を記入（プレースホルダを置換）
```

デプロイ:

```bash
npm run deploy:hosting:dev    # dev サイトへ
npm run deploy:hosting:prod   # prod サイトへ
# どちらも内部で deploy/deploy-hosting.sh <env> を実行
```

### 拡張側の実装（実装済み）

- `src/picker/host.ts`: Firebase の URL（`__PICKER_HOST_URL__`）を **`window.open`（最上位の別ウィンドウ）** で開く方式。ポップアップブロック回避のためボタン（ユーザー操作）起点。`event.origin` を Picker サイトのオリジンに限定し、`dwp_ready` 受信後に `dwp_init`（token/apiKey/appId）を**正規オリジン宛にのみ** `postMessage`。選択結果は `window.opener` 経由で受信
- `src/picker/host.html`: iframe を廃止し「フォルダを選択」ボタンに変更
- `src/manifest.json`: `sandbox` / `content_security_policy.sandbox` を撤去。iframe しないため `frame-src` は不要（`extension_pages` は `script-src 'self'; object-src 'self';`）
- 旧サンドボックス版 `src/picker/picker.html` / `picker.ts` は**削除済み**
- `build.mjs`: `__PICKER_HOST_URL__` をビルド時注入（dev=`DWP_DEV_PICKER_URL` / release=`DWP_RELEASE_PICKER_URL`、`.env.local` 由来）

### ビルド時環境変数（`.env.local`）

| 変数 | 用途 |
|------|------|
| `DWP_DEV_PICKER_URL` | dev ビルドが開く Picker ページ URL（例: `https://<dev-site>.web.app/`） |
| `DWP_RELEASE_PICKER_URL` | release ビルドが開く Picker ページ URL（例: `https://<prod-site>.web.app/`） |

> Firebase へデプロイして払い出された各 URL を設定する。未設定だとフォルダ選択を開けない（ビルド時に警告）。

### 実装上の注意（ハマりどころ）

- **Picker ページは最上位ウィンドウで動かす（iframe 不可）**。`Incorrect origin value. Expected 'chrome-extension://…' but was 'https://…web.app'` は、Picker を拡張ページの iframe（入れ子）で動かすと発生する。Picker は最上位ウィンドウのオリジンを基準にするため、`window.open` で Firebase ページを別ウィンドウとして開く（最上位＝Firebase に揃える）。
- `PickerBuilder.setOrigin(window.location.origin)` も指定しておく（自分のオリジンを明示）。
- `docs.google.com` の `frame-ancestors … (report-only)` 警告は **report-only（ブロックしない）**なので無視してよい。

### データ境界（厳守）

Picker ページに渡すのは **token / apiKey / appId / 選択結果のみ**。**Drive ファイルの中身は外部ページを一切通らない**（取得は `lib/drive-api.ts` 経由で SW のみ）。詳細は `SECURITY.md`「1.5」、ルールは CLAUDE.md「実装方針」。

## 7. 段階移行

1. 現行（`drive.readonly`）で限定公開・社内検証（`PUBLISHING.md`）
2. 本仕様で `drive.file` ＋ Picker を実装（別ブランチ推奨）
3. 一般公開＋OAuth 検証（CASA 不要の軽い検証）

## 関連

`DISTRIBUTION.md` / `PUBLISHING.md` / `AUTH.md` / `SETUP_OAUTH.md` / `SECURITY.md`
