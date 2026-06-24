# CONTENT_TYPE - Content-Type 解決

`lib/content-type.ts` の責務と、拡張子 / Drive mimeType → レスポンス `Content-Type` のマッピングを定義する。

## 1. 方針

ブラウザがリソースを正しく解釈できるよう、`Response` に適切な `Content-Type` を付与する。**拡張子を第一の根拠**とし、不明な場合に Drive の `mimeType` をフォールバックに使う（Drive はテキストを `text/plain` 等で返すことがあり、拡張子の方が意図に合致するため）。

## 2. 解決ロジック

```
resolve(relativePath, driveMimeType?): string
```

1. `relativePath` の拡張子を小文字で取り出す
2. 下記マッピングに一致すればそれを返す
3. 無ければ `driveMimeType`（あれば）を返す
4. それも無ければ `application/octet-stream`

テキスト系には `; charset=utf-8` を付与する。

## 3. マッピング表

| 拡張子 | Content-Type |
|--------|-------------|
| `html` / `htm` | `text/html; charset=utf-8` |
| `css` | `text/css; charset=utf-8` |
| `js` / `mjs` | `text/javascript; charset=utf-8` |
| `json` | `application/json; charset=utf-8` |
| `xml` | `application/xml; charset=utf-8` |
| `txt` | `text/plain; charset=utf-8` |
| `svg` | `image/svg+xml` |
| `png` | `image/png` |
| `jpg` / `jpeg` | `image/jpeg` |
| `gif` | `image/gif` |
| `webp` | `image/webp` |
| `avif` | `image/avif` |
| `ico` | `image/x-icon` |
| `woff` | `font/woff` |
| `woff2` | `font/woff2` |
| `ttf` | `font/ttf` |
| `otf` | `font/otf` |
| `eot` | `application/vnd.ms-fontobject` |
| `mp4` | `video/mp4` |
| `webm` | `video/webm` |
| `mp3` | `audio/mpeg` |
| `wav` | `audio/wav` |
| `wasm` | `application/wasm` |
| `pdf` | `application/pdf` |

## 3.5 Markdown（.md / .markdown）

`.md` / `.markdown` は**そのまま配信せず、Service Worker でサーバー側 HTML に変換**して `text/html; charset=utf-8` で返す（`lib/markdown.ts`、`marked` を使用）。ブラウザは Markdown をレンダリングできないため、変換が必要。詳細は `SERVICE_WORKER.md`。

## 4. 注意

- JS は `text/javascript`（MIME チェックに引っかからないよう `application/javascript` ではなくこちらを基本にする）
- `wasm` は `application/wasm` でないと `WebAssembly.instantiateStreaming` が失敗するため厳守
- 未知拡張子のフォールバックは `application/octet-stream`（ダウンロード扱いになりうるが、安全側）

## 5. 関連

`SERVICE_WORKER.md` / `DRIVE_API.md`
