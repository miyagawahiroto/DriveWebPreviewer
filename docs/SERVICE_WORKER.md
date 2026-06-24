# SERVICE_WORKER - Service Worker（仮想 Web サーバー）

`background/service-worker.ts` の責務・ライフサイクル・fetch インターセプト方式を定義する。

## 1. 責務

1. content-script / popup からのメッセージ受信（`start_preview` 等）
2. `PreviewSession` の生成・保存・プレビュータブのオープン
3. `preview/` 配下への `fetch` をインターセプトし、Drive 上のファイルを解決して `Response` を返す（仮想 Web サーバー）

## 2. Manifest V3 ライフサイクル前提（最重要）

MV3 の Service Worker は **イベント駆動**で、アイドル数分でスリープし、メモリ（グローバル変数）はリセットされる。

### 設計ルール

- **永続が必要な状態はメモリに持たない**。`PreviewSession` は `chrome.storage.session` に保存し、`fetch` のたびに復元する（`session-state.ts`）
- **イベントリスナはトップレベルで同期登録する**。`chrome.runtime.onMessage` / `self.addEventListener("fetch", ...)` を非同期処理の中で登録しない（SW 再起動で取りこぼす）
- **インメモリはキャッシュ用途のみ**。消えても再構築可能なもの（フォルダ内ファイル一覧の一時キャッシュ等）に限定し、欠落時は再取得にフォールバックする

## 3. メッセージ処理

```
onMessage(start_preview { fileId, parentId, fileName })
  → sessionId 採番（crypto.randomUUID）
  → PreviewSession { sessionId, rootFolderId: parentId, entryFileName: fileName }
  → session-state.save(session)
  → chrome.tabs.create({ url: previewUrl(sessionId, fileName) })
```

`previewUrl(sessionId, path)` = `chrome.runtime.getURL("preview/" + sessionId + "/" + path)`

## 4. fetch インターセプト

```
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!isPreviewUrl(url)) return;          // preview/ 以外は素通し
  event.respondWith(handlePreviewRequest(url));
});
```

`handlePreviewRequest(request)` の流れ：

1. `parsePreviewUrl(url)` → `{ sessionId, relativePath }`
2. `session = await session-state.load(sessionId)`。無ければ 404
3. `relativePath` を正規化（末尾 `/` は `index.html`、クエリ・ハッシュ除去）
4. `Range` ヘッダがなければ `cache.match(sessionId, relativePath)`。ヒットなら返却
5. **配信元の切り替え**（`session.source`）:
   - `demo`: `lib/demo-content.ts` のバンドル資産から取得（`DEMO.md`）
   - `drive`: 6 以降へ
6. miss: `resolved = await resolvePathCached(session, relativePath)`（パス解決のメモ化＋in-flight 重複排除。`PERFORMANCE.md`）
   - 見つからなければ 404
7. `driveRes = await drive-api.getMediaRaw(fileId, rangeHeader?)`
   - 認証エラーは 401、権限エラーは 403、その他は 502
8. `contentType = content-type.resolve(relativePath, mimeType)`
9. **応答の組み立て（メモリ方針は `PERFORMANCE.md`）**:
   - **Markdown（`.md` / `.markdown`）** → テキスト取得 → `lib/markdown.ts` で HTML 変換 → `text/html` で返す（キャッシュする）
   - `Range` あり → `206` を `Content-Range` 付きでストリーミング透過（非キャッシュ）
   - `Content-Length` が `LARGE_FILE_THRESHOLD` 超 → `body` をストリーミング透過（非キャッシュ）
   - それ以外（小ファイル）→ `arrayBuffer()` 化して `Response` を作り、`cache.put` してから返す
10. いずれも（Markdown を除き）`Accept-Ranges: bytes` を付与する

### エントリの決定（特定ファイル単体プレビュー）

`start_preview` 受信時、`resolveDriveTarget` が以下でエントリを確定する：

- **`fileId` がある**（ファイルを開いている／選択中）→ `files.get` で親フォルダ・名前を逆引きし、**そのファイル単体**をエントリにする（`index.html` 以外でも可）
- **`parentId` のみ**（フォルダを開いている）→ `index.html` をエントリにする

### エラー時の Response

| 状況 | ステータス | ボディ |
|------|-----------|--------|
| セッション喪失 | 404 | 簡易 HTML（再実行を促す） |
| ファイル未発見 | 404 | 簡易 HTML |
| 認証切れ | 401 | 簡易 HTML（再認証導線） |
| 権限なし | 403 | 簡易 HTML |
| Drive API 失敗 | 502 | 簡易 HTML |

いずれも `respondWith` が必ず `Response` を返し、タブが無限ローディングにならないようにする。

## 5. preview タブの初期 HTML

`preview/loading.html` は静的に同梱するが、実際のエントリ HTML 取得は fetch インターセプトで行うため、ブラウザが `preview/<sessionId>/index.html` をリクエストした時点で SW が中身を返す。`web_accessible_resources` に `preview/*` を登録する。

## 6. 関連

`DRIVE_API.md` / `PATH_RESOLUTION.md` / `CONTENT_TYPE.md` / `CACHE.md` / `AUTH.md`
