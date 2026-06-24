# DriveWebPreviewer

Google Drive 上に置いた HTML / CSS / JavaScript / 画像で構成された Web ページを、**外部サービスにアクセス権限を渡すことなく**、そのままブラウザでレンダリングしてプレビューする Chrome 拡張機能（Manifest V3）です。

---

## なにを解決するのか

Google Drive 単体では HTML をソースコードとして表示してしまい、Web ページとしてレンダリングできません。本拡張は **Service Worker をブラウザ内の「仮想 Web サーバー」として動作させ**、`chrome-extension://` の内部 URL へのリクエストを横取りして Google Drive API からファイルを取得し、適切な `Content-Type` を付けて返すことで、Drive 上のページをそのまま表示します。

| 課題 | 本拡張のアプローチ |
|------|------------------|
| Drive は HTML をレンダリングできず、ソースコードが表示される | Service Worker が仮想 Web サーバーとして HTML を正しい MIME で返す |
| 外部サービス（DriveToWeb 等）に Drive の権限を渡す不安 | OAuth トークンを `chrome.identity` でブラウザ内に閉じ込め、**外部サーバーへファイルも権限も渡さない** |
| 相対パス（`href="style.css"` 等）がリンク切れする | CSS・JS・画像の後続リクエストも親フォルダ内から解決して返すため、ページが崩れない |

---

## 仕組み

```
[Drive 上で index.html を選択 → 拡張ボタン]
            │  ファイル ID / 親フォルダ ID を取得
            ▼
[新規タブで chrome-extension://<ID>/preview/index.html を開く]
            │
            ▼
[Service Worker が fetch をインターセプト]
            │  対象ファイルを Drive API から取得（Cache API でキャッシュ）
            ▼
[適切な Content-Type を付けて「通常の Web 応答」として返却]
            │  後続の CSS / JS / 画像リクエストも同様に親フォルダから解決
            ▼
[ブラウザがページをそのままレンダリング]
```

### 設計上の工夫

| 課題 | 対策 |
|------|------|
| API 通信のラグ | **Cache API** で取得済みファイルをキャッシュし、再取得を高速化 |
| 同名ファイルの重複 | **更新日時（または作成日時）が最新**のものを優先取得 |
| Service Worker の寿命（MV3 で数分でスリープ） | 親フォルダ ID 等を **`chrome.storage.session`** に保存し、復帰後に状態を復元 |
| OAuth トークンの安全な管理 | **`chrome.identity` API** で認証し、トークンをブラウザ内で完結させる |

---

## 開発

```bash
npm install        # 依存インストール
npm run dev        # 開発ビルド（watch）
npm run build      # 本番ビルド（dist/ 出力）
npm run lint       # 静的解析
npm run typecheck  # 型チェック
```

### Chrome への読み込み

1. `npm run build`（または `npm run dev`）でビルド
2. Chrome で `chrome://extensions` を開く
3. 右上の「デベロッパーモード」を ON
4. 「パッケージ化されていない拡張機能を読み込む」から `dist/`（ビルド出力ディレクトリ）を選択

---

## 技術スタック

- **Manifest V3** / **TypeScript**
- **Service Worker** — `fetch` インターセプトによる仮想 Web サーバー
- **Google Drive API (v3)** — ファイル検索・取得
- **`chrome.identity`** — OAuth2 認証（クライアントシークレット不要）
- **`chrome.storage.session`** — Service Worker スリープ復帰のための状態保存
- **Cache API** — 取得済みファイルのキャッシュ

---

## セキュリティ / プライバシー

- ファイルや OAuth トークンを**外部サーバーへ送信しません**。すべてブラウザ内で完結します
- `manifest.json` の権限（`permissions` / `host_permissions`）は必要最小限に絞ります
- OAuth スコープは閲覧用（`drive.readonly` 相当）を基本とし、機密値はソースに同梱しません

詳細は [CLAUDE.md](./CLAUDE.md) および `docs/SECURITY.md`（整備予定）を参照してください。

---

## ドキュメント

設計仕様は `docs/` 配下に整備します（実装前に作成・更新するルール）。一覧は [CLAUDE.md](./CLAUDE.md) の「関連ドキュメント」を参照してください。

> **開発ルール**: 機能の追加・変更を行う際は、必ず先に仕様書（`docs/` 配下）を作成・更新してから実装に入ります。
