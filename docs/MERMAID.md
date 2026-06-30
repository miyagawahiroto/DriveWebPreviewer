# MERMAID - Markdown 内 Mermaid 記法のプレビュー対応

Markdown プレビュー（`lib/markdown.ts`）で、` ```mermaid ` コードブロックを図としてレンダリングする。

## 1. 目的

Markdown 内に書かれた Mermaid 記法（フローチャート・シーケンス図・ガント等）を、ソースコードのままではなく**図として描画**してプレビューできるようにする。設計資料・仕様書を Drive に置いてそのまま図つきで確認できることを狙う。

## 2. なぜクライアント側で描画するか

Mermaid は描画に **DOM（`document` / SVG 生成）が必要**で、Service Worker には DOM が無いためサーバー側（SW 内）でレンダリングできない。したがって：

- SW（`renderMarkdown`）は Markdown → HTML 変換までを行い、Mermaid ブロックは **`<pre class="mermaid">…</pre>`** のプレースホルダとして出力する
- 実際の図描画は、プレビュータブ（`chrome-extension://<id>/preview/...`）の中で **バンドル済み Mermaid スクリプト**が行う

## 3. CSP とスクリプト配信

プレビューページは拡張オリジン（`chrome-extension://<拡張機能ID>`）で動作し、MV3 既定の CSP（`script-src 'self'`）が適用される。したがって：

- **インラインスクリプトは不可**。Mermaid 実行コードは外部ファイルとして同一オリジンから読み込む
- 配信パスは **`assets/mermaid-runtime.js`**（`preview/` 配下を避ける）。`preview/` は SW の fetch インターセプト対象のため、ここに置くとセッション URL と誤認される。`assets/` 直下なら通常の同梱リソースとしてそのまま配信される
- 同一オリジンのページが自分自身のリソースを読むため **`web_accessible_resources` への登録は不要**
- Mermaid は図種別を動的 import で遅延ロードするため、ビルドは **コード分割（esbuild `splitting`）**して `assets/` にチャンクを出力する。チャンクも同一オリジン読み込みのため WAR 不要

## 4. 注入条件（パフォーマンス）

Mermaid バンドルは大きい。**Markdown 内に Mermaid ブロックが 1 つ以上ある場合のみ** `<script>` を注入する。Mermaid を含まない通常の Markdown には注入せず、従来どおり軽量に表示する。

判定は **変換後 HTML に mermaid プレースホルダ（`<pre class="mermaid">`）が実際に出力されたか**で行う（`inner.includes('class="mermaid"')`）。注入要否の判定と実際の `<pre>` 出力をレンダラの同一経路に揃えることで、別ロジック（ソースの正規表現等）による取りこぼし・無駄な注入を避ける。`renderMarkdown` は `await` を挟むため、モジュールレベルの可変フラグは同時呼び出しで競合しうる。変換後文字列で判定すればローカル変数のみで完結し、共有可変状態を持たない。

## 5. レンダリングフロー

1. `renderMarkdown(md, title, { mermaidRuntimeUrl })` を呼ぶ
2. `marked` のレンダラで ` ```mermaid ` を `<pre class="mermaid">`（中身はエスケープした図ソース）に変換し、Mermaid 使用フラグを立てる
3. フラグが立っていて `mermaidRuntimeUrl` がある場合のみ、HTML 末尾に `<script type="module" src="<mermaidRuntimeUrl>">` を追加
4. `mermaidRuntimeUrl` は SW 側で `chrome.runtime.getURL("assets/mermaid-runtime.js")` を解決して渡す
5. プレビュータブで `mermaid-runtime.js` が `DOMContentLoaded` 後に `mermaid.run()` を呼び、`.mermaid` 要素を SVG に置換する

## 6. エラーハンドリング

- 不正な Mermaid 構文はブロック単位で失敗しうる。`mermaid.run()` は失敗要素にエラー表示を出すが、**ページ全体は壊さない**（他のブロック・本文は表示される）
- Mermaid スクリプトの読み込み失敗時も、プレースホルダ（図ソースの `<pre>`）はテキストとして残る（劣化表示）

## 7. キャッシュ

変換後の HTML は従来どおりセッションキャッシュに載る（`CACHE.md`）。`mermaidRuntimeUrl` は拡張機能 ID 由来で安定しているためキャッシュ整合性に問題はない。

## 8. テスト

`samples/06-mermaid/` に Mermaid を含む Markdown を用意し、Drive 上でプレビューして図が描画されることを確認する（`samples/README.md`）。基本の Markdown 描画は `samples/05-markdown/` で確認する。

## 9. 関連

`CONTENT_TYPE.md`（3.5 Markdown） / `SERVICE_WORKER.md` / `CACHE.md` / `PERFORMANCE.md`
