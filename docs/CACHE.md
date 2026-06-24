# CACHE - キャッシュ（Cache API）

`lib/cache.ts` の責務と、キー設計・無効化・セッション分離を定義する。

## 1. 目的

CSS・画像が多いページで Drive API を都度叩くと遅い。一度取得したファイルを Cache API に保存し、再リクエストを高速化する。

## 2. ストレージ

Service Worker から利用できる **Cache API**（`caches.open(CACHE_NAME)`）を使う。

- `CACHE_NAME = "dwp-preview-v1"`（スキーマ変更時にバージョンを上げて旧キャッシュを破棄）

## 3. キー設計

キャッシュキーは URL 文字列で表現する。**注意: Cache API は `chrome-extension://` スキームをキーにできない（http/https のみ）**。そのため、実際には fetch しない**合成 https URL** を基底に使う：

```
key = "https://drive-web-previewer.cache/preview/" + sessionId + "/" + relativePath
```

これにより：

- **セッション分離**: `sessionId` が異なれば別エントリ。別プレビューの取り違えが起きない
- **パス一意性**: 相対パスがキーに含まれる
- **スキーム制約の回避**: `chrome-extension://` を直接キーにすると `Cache.put` が `Request scheme 'chrome-extension' is unsupported` で失敗する

## 4. API

```
match(sessionId, relativePath): Promise<Response | null>
put(sessionId, relativePath, response): Promise<void>
invalidateSession(sessionId): Promise<void>   // 該当セッションの全エントリ削除
clearAll(): Promise<void>                       // 全キャッシュ削除（設定画面から）
```

`put` の `response` は `Content-Type` ヘッダ付きで保存し、`match` の戻り値をそのまま返せるようにする。

## 5. 無効化ポリシー

| トリガー | 動作 |
|----------|------|
| プレビュータブを閉じた / セッション終了 | `invalidateSession(sessionId)`（任意。容量に応じて） |
| ユーザーが設定画面で「キャッシュ削除」 | `clearAll()` |
| `CACHE_NAME` のバージョン更新（拡張更新時） | 旧キャッシュ名を `caches.delete` |

### ファイル更新の反映

Drive 上でファイルを更新してもキャッシュが古い版を返す可能性がある。当面は **セッション単位キャッシュ**（プレビューを開き直せば新セッション＝別キー＝再取得）で割り切る。将来 `modifiedTime` をキーに含める案を検討する。

## 6. 容量管理（実装済み）

Cache API は無制限ではない。エントリ数の上限 `MAX_CACHE_ENTRIES`（既定 300）を設け、`put` 時に超過していれば **挿入順が古いエントリから削除**（FIFO eviction）する。`cache.keys()` は挿入順を返すため、先頭から必要数を `delete` する。

### キャッシュしないケース（PERFORMANCE.md と整合）

- `Content-Length` が `LARGE_FILE_THRESHOLD`（既定 5 MiB）を超える大ファイル → ストリーミング透過のため保存しない
- `Range` リクエストの `206` 部分応答 → 保存しない

## 7. 関連

`SERVICE_WORKER.md`
