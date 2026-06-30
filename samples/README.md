# samples - 動作確認用テストサイト集

DriveWebPreviewer の動作確認用サンプル。**各フォルダを丸ごと Google Drive にアップロード**し、そのフォルダを開いて「Web プレビュー」ボタンで表示を確認する。

各ページは「何が読み込めたか」を画面上にチェックリスト表示するので、CSS・JS・画像・サブフォルダ解決が成功したか一目で分かる。

## サンプル一覧

| フォルダ | 確認内容 | 構成 |
|---------|---------|------|
| `01-single-inline/` | HTML が `text/html` でレンダリングされ、**インライン JS も動く**（外部参照が無いためサンドボックス表示。`docs/SANDBOX_PREVIEW.md`） | `index.html` のみ（CSS/JS インライン・外部参照なし） |
| `02-flat-assets/` | 同一フォルダ内の相対パス解決（CSS / JS / SVG） | `index.html` + `style.css` + `app.js` + `logo.svg` |
| `03-subfolders/` | **サブフォルダの相対パス解決**（本機能の核） | `index.html` + `css/` + `js/` + `assets/` |
| `04-content-types/` | 複数 Content-Type（CSS / JS / SVG / **PNG バイナリ** / **JSON fetch**） | `index.html` + `style.css` + `app.js` + `icon.svg` + `pixel.png` + `data.json` |
| `05-markdown/` | **Markdown が HTML にレンダリング**される（ソース表示でない） | `index.md` のみ |
| `06-mermaid/` | **Markdown 内の Mermaid 記法が図として描画**される | `index.md`（mermaid ブロック入り） |
| `07-sandbox-inline/` | **外部参照なし HTML のインライン JS が動く**（サンドボックス表示・`onclick`/`eval`/`new Function` 含む） | `index.html` のみ（CSS/JS インライン・画像は data URI） |
| `08-multifile-inline/` | **複数ファイル構成でもインライン JS が動く**（参照リソースを全インライン化してサンドボックス表示） | `index.html` + `style.css` + `app.js` + `logo.svg` ＋インライン JS |

## 使い方

1. 確認したいフォルダ（例: `03-subfolders`）を **フォルダごと** Drive にアップロード
2. Drive でそのフォルダを開く（URL が `.../folders/...` になる）
3. 拡張機能の「Web プレビュー」をクリック
4. 表示されたページのチェックリストが**すべて緑（✓）**になれば成功

## 期待結果の見方

- **HTML**: ページ自体が（ソースでなく）描画されていれば OK
- **CSS**: 背景・カードがスタイルされ、チェック項目が「✓ CSS 適用」になる
- **JS**: 「✓ JS 実行」に変わる（初期表示は「JS 未実行」）
- **画像/SVG**: ロゴ・画像が表示される
- **JSON（04 のみ）**: `data.json` の内容が画面に出る
- **Markdown（05）**: 見出し・表・コードが整形表示される（`#` などの記号がそのまま出ない）
- **Mermaid（06）**: フローチャート / シーケンス図 / ガントが SVG 図として描画される（mermaid のコードがそのまま出ない）
- **サンドボックス（07）**: チェックリストが**すべて ✓（緑）**になり（`onclick` ボタンも押す）、サマリが「すべて成功」になる。DevTools コンソールに **CSP 違反が出ない**こと。もし全項目 ✗ なら、外部参照ありと誤判定されサンドボックスに乗っていない可能性
- **複数ファイル＋インライン JS（08）**: 外部 CSS/画像/JS（相対参照）が全インライン化され、外部参照とインライン JS の**両方**が動く。全項目 ✓（`onclick` ボタンも押す）になれば成功。第二段階（全インライン化）の検証

> 05 / 06 は単一の `.md` ファイルなので、フォルダごとアップロードしても、`index.md` を選択して「Web プレビュー」でも確認できます。
