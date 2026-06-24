// Cache API ラッパー
// キー設計・無効化・上限つき eviction は docs/CACHE.md / docs/PERFORMANCE.md を参照。

export const CACHE_NAME = "dwp-preview-v1";

/** Cache API に保持するエントリ数の上限（超過時は FIFO で削除）。 */
export const MAX_CACHE_ENTRIES = 300;

/** これを超えるファイルはストリーミング透過し、キャッシュしない（5 MiB）。 */
export const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024;

// Cache API は chrome-extension:// スキームをキーにできない（http/https のみ）。
// 実際に fetch しない合成 https オリジンをキャッシュキーの基底に使う。
const CACHE_KEY_BASE = "https://drive-web-previewer.cache/preview";

/** キャッシュキー（合成 https URL）を組み立てる。 */
function previewKey(sessionId: string, relativePath: string): string {
  return `${CACHE_KEY_BASE}/${sessionId}/${relativePath}`;
}

/** キャッシュからレスポンスを取得する。無ければ null。 */
export async function match(
  sessionId: string,
  relativePath: string,
): Promise<Response | null> {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(previewKey(sessionId, relativePath));
  return hit ?? null;
}

/**
 * レスポンスをキャッシュに保存する。
 * 上限を超える場合は挿入順が古いエントリから削除する（FIFO eviction）。
 */
export async function put(
  sessionId: string,
  relativePath: string,
  response: Response,
): Promise<void> {
  const cache = await caches.open(CACHE_NAME);

  // cache.keys() は挿入順を返す。上限を超える分を先頭（古い順）から削除。
  const keys = await cache.keys();
  if (keys.length >= MAX_CACHE_ENTRIES) {
    const overflow = keys.length - MAX_CACHE_ENTRIES + 1;
    await Promise.all(keys.slice(0, overflow).map((req) => cache.delete(req)));
  }

  await cache.put(previewKey(sessionId, relativePath), response);
}

/** 指定セッションに属するキャッシュエントリをすべて削除する。 */
export async function invalidateSession(sessionId: string): Promise<void> {
  const cache = await caches.open(CACHE_NAME);
  const prefix = `${CACHE_KEY_BASE}/${sessionId}/`;
  const keys = await cache.keys();
  await Promise.all(
    keys
      .filter((req) => req.url.startsWith(prefix))
      .map((req) => cache.delete(req)),
  );
}

/** 全キャッシュを削除する（設定画面から）。 */
export async function clearAll(): Promise<void> {
  await caches.delete(CACHE_NAME);
}
