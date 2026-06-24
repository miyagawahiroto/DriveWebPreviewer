# PICKER - drive.file ＋ Google Picker 方式（一般公開向け）

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
2. popup が `auth.ensureToken()` でトークン取得（`drive.file` スコープ同意）
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

## 7. 段階移行

1. 現行（`drive.readonly`）で限定公開・社内検証（`PUBLISHING.md`）
2. 本仕様で `drive.file` ＋ Picker を実装（別ブランチ推奨）
3. 一般公開＋OAuth 検証（CASA 不要の軽い検証）

## 関連

`DISTRIBUTION.md` / `PUBLISHING.md` / `AUTH.md` / `SETUP_OAUTH.md` / `SECURITY.md`
