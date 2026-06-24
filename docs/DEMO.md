# DEMO - OAuth 不要のローカル動作確認モード

実 Drive・OAuth クライアント ID を用意しなくても、**仮想 Web サーバーのパイプライン（fetch インターセプト → パス解決 → Content-Type 付与 → レンダリング）をローカルで確認できる**デモモードを提供する。

## 1. 目的

- OAuth クライアント ID 発行（人間タスク）前でも、拡張の中核挙動を実機で確認できる
- バンドル同梱のサンプルサイトを、Drive と同じ fetch インターセプト経路で配信する

## 2. 仕組み

- `PreviewSession.source` に `"drive" | "demo"` を持たせる
- デモセッションは `rootFolderId = "__demo__"`、`source = "demo"`
- Service Worker は `source` を見て配信元を切り替える：
  - `drive`: `path-resolver` → Drive API（通常経路）
  - `demo`: `lib/demo-content.ts` のバンドル済みファイルマップから取得
- デモのサンプルは小さなテキスト資産（HTML / CSS / JS / SVG）で構成し、相対パス・サブフォルダ解決も確認できるようにする

## 3. 起動方法

1. `npm run build`
2. `chrome://extensions` でデベロッパーモード ON →「パッケージ化されていない拡張機能を読み込む」で `dist/` を選択
3. 拡張アイコンのポップアップで「デモを開く」をクリック
4. 新規タブでサンプルサイトが表示され、CSS・画像・サブフォルダの相対パスが解決されることを確認

## 4. デモで確認できること

| 確認項目 | サンプル内の対象 |
|---------|-----------------|
| HTML が `text/html` で表示される | `index.html` |
| CSS の相対パス解決 | `style.css` |
| サブフォルダの解決 | `assets/logo.svg` |
| JS の `text/javascript` 配信 | `app.js` |
| 404 応答 | 存在しないパスへのアクセス |

## 5. 注意

- デモはあくまでパイプライン確認用。実運用は Drive 経路（OAuth 必須）
- デモ資産は拡張にバンドルされる小さな静的データであり、外部通信を行わない

## 6. 関連

`SERVICE_WORKER.md` / `ARCHITECTURE.md` / `UI.md`
