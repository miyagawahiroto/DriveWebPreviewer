// chrome.storage.session への PreviewSession 保存・復元
// Service Worker のスリープをまたいで状態を維持する（docs/SERVICE_WORKER.md）。

import type { PreviewSession } from "../types/preview.js";

/** storage.session 内のキー接頭辞。 */
const KEY_PREFIX = "session:";

function keyOf(sessionId: string): string {
  return `${KEY_PREFIX}${sessionId}`;
}

/** セッションを保存する。 */
export async function save(session: PreviewSession): Promise<void> {
  await chrome.storage.session.set({ [keyOf(session.sessionId)]: session });
}

/** セッションを復元する。無ければ null。 */
export async function load(sessionId: string): Promise<PreviewSession | null> {
  const key = keyOf(sessionId);
  const result = await chrome.storage.session.get(key);
  return (result[key] as PreviewSession | undefined) ?? null;
}

/** セッションを削除する。 */
export async function remove(sessionId: string): Promise<void> {
  await chrome.storage.session.remove(keyOf(sessionId));
}
