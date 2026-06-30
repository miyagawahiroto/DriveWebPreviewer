# 05 - Markdown 基本表示テスト

このページは `.md` ファイルが **Web ページとしてレンダリング**（ソース表示ではなく）されることを確認するサンプルです。Service Worker が Markdown を HTML に変換して配信しています。

## 確認ポイント

- [x] 見出し（h1〜h3）にスタイルが当たっている
- [x] **太字**・*斜体*・`インラインコード` が描画される
- [x] リスト・テーブル・引用・リンクが表示される

## テキスト装飾

通常の段落テキスト。**太字**、*斜体*、~~打ち消し~~、`code`。
[リンク（Google Drive）](https://drive.google.com/) も青色で表示されます。

## リスト

1. 番号付きリスト 1
2. 番号付きリスト 2
   - ネストした箇条書き
   - もう一つ

## コードブロック

```js
function hello(name) {
  return `Hello, ${name}!`;
}
console.log(hello("DriveWebPreviewer"));
```

## テーブル

| 項目 | 内容 |
|------|------|
| 変換元 | `.md` / `.markdown` |
| 変換先 | `text/html; charset=utf-8` |
| 変換場所 | Service Worker（`lib/markdown.ts`） |

## 引用

> Markdown はサーバー側（Service Worker）で HTML に変換してから配信します。
> ブラウザは Markdown を直接レンダリングできないためです。

---

すべて整形されて表示されていれば成功です。Mermaid 記法の確認は `06-mermaid` を参照してください。
