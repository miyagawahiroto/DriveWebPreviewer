# PATH_RESOLUTION - 相対パス解決

`lib/path-resolver.ts` の責務と、相対パス → Drive 上の `fileId` 解決アルゴリズムを定義する。

## 1. 目的

ページは `index.html` から `css/style.css`、`../img/logo.png`、`js/app.js` のように相対パスでリソースを参照する。これらを Drive のフォルダ階層を辿って `fileId` に解決する。

## 2. 前提

- プレビューセッションは `rootFolderId`（エントリ HTML が属する親フォルダ）を持つ
- Drive 上のフォルダ構成が、Web ページのディレクトリ構成と一致している前提（アップロード時にフォルダ構造を保持）

## 3. URL → 相対パス

`preview/<sessionId>/<relativePath>` から `relativePath` を取り出す。

正規化ルール：

- クエリ文字列（`?v=2`）・ハッシュ（`#sec`）を除去
- 末尾が `/` またはパス無しの場合は `index.html` を補う
- 先頭の `/` を除去
- `.` / `..` を解決してセグメント配列にする（`..` がルートを超える場合は 404 扱い）

## 4. 解決アルゴリズム（resolve）

```
resolve(rootFolderId, relativePath): Promise<string | null>
```

1. `segments = normalize(relativePath).split("/")`（例: `["css", "style.css"]`）
2. 最後のセグメントが **ファイル名**、それ以外は **フォルダ名**
3. `currentFolderId = rootFolderId`
4. フォルダ名セグメントを順に `drive-api.findFolder(currentFolderId, name)` で辿り `currentFolderId` を更新。途中で見つからなければ `null`
5. 末尾のファイル名を `drive-api.findFile(currentFolderId, fileName)` で解決し、`file.id` を返す。無ければ `null`

各段の同名重複は `drive-api` 側のルール（更新日時最新優先）で解決される。

## 5. フォルダ ID キャッシュ（任意・性能）

同一フォルダを何度も辿るのを避けるため、`(parentFolderId, name) → folderId` をセッション単位でメモ化してよい。これはインメモリ（SW スリープで消えても再構築可能）または `cache` 層に置く。欠落時は再解決にフォールバックする。

## 6. エッジケース

| 入力 | 扱い |
|------|------|
| `""` / `/` | `index.html` |
| `css/` | `css/index.html` |
| `../../x` がルート超過 | 404 |
| 絶対 URL（`https://...`） | インターセプト対象外（素通し） |
| データ URL（`data:`） | インターセプト対象外 |

## 7. 関連

`DRIVE_API.md` / `SERVICE_WORKER.md`
