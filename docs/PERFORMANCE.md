# PERFORMANCE - メモリ / CPU 最適化方針

「軽さ」を保つための設計方針。リソースを浪費しない（メモリ・CPU・API 呼び出し）ことを優先する。

## 1. 構造的に有利な点（MV3）

- Service Worker は**アイドルで自動スリープ**し、未使用時はメモリを消費しない（常駐サーバーと異なる）
- 状態をメモリに持たず `chrome.storage.session` から復元するため、スリープが安全に行える

## 2. メモリを浪費しないための規則

### 2.1 大きいファイルはバッファ／キャッシュしない（ストリーミング透過）

- レスポンスの `Content-Length` が `LARGE_FILE_THRESHOLD`（既定 5 MiB）を超える場合、`ArrayBuffer` に全展開せず、Drive のレスポンス `body`（`ReadableStream`）を**そのまま透過**して返す
- 大きいファイルは **Cache API に保存しない**（ディスク／メモリ肥大の防止）

### 2.2 Range リクエストの透過（動画・音声）

- リクエストに `Range` ヘッダがある場合、それを Drive の `alt=media` 取得へ転送し、`206 Partial Content` を `Content-Range` 付きで透過する
- Range レスポンスはキャッシュしない（部分応答のため）
- 通常応答には `Accept-Ranges: bytes` を付け、メディア要素のシークを成立させる

### 2.3 Cache API は上限つき（eviction）

- エントリ数の上限 `MAX_CACHE_ENTRIES`（既定 300）を設け、超過時は**挿入順が古いものから削除**（FIFO）
- 設定画面から全削除（`clearAll`）も可能（`CACHE.md`）

## 3. CPU / API 呼び出しを浪費しないための規則

### 3.1 パス解決のメモ化

- `sessionId + relativePath` → `{ fileId, mimeType }` を **メモリ上の上限つき Map** にメモ化する（`RESOLVE_CACHE_LIMIT`、既定 500）
- スリープで消えても再構築可能（Cache API ヒット時はそもそも解決に到達しない）

### 3.2 in-flight 重複排除

- 同一 `sessionId + relativePath` の**パス解決**が同時に走らないよう、進行中の Promise を共有する
- ページ読み込み時に同じリソースへ並行リクエストが飛んでも、フォルダ探索 API は一度で済む
- 注意: レスポンス本体（body）は単回消費のため共有しない。重複排除は**解決処理（fileId 特定）のみ**に適用し、本体取得・ストリーミングは各リクエストで行う

## 4. しきい値・定数（既定値）

| 定数 | 既定 | 意味 |
|------|------|------|
| `LARGE_FILE_THRESHOLD` | 5 MiB | これを超えるとストリーミング透過＋非キャッシュ |
| `MAX_CACHE_ENTRIES` | 300 | Cache API のエントリ上限（FIFO eviction） |
| `RESOLVE_CACHE_LIMIT` | 500 | パス解決メモ化の上限 |

いずれも `lib/` 内の定数で集中管理し、変更時はこのドキュメントを更新する。

## 5. 計測・確認

- 動作確認は `chrome://extensions` のデベロッパーモードで、`chrome://serviceworker-internals` / DevTools の Memory・Network で確認する
- 大ファイル時に SW のメモリが跳ねないこと、同名・多リソースページで `files.list` 呼び出し回数が抑えられていることを確認する

## 6. 関連

`CACHE.md` / `SERVICE_WORKER.md` / `DRIVE_API.md`
