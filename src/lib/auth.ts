// chrome.identity による OAuth トークン管理
// 方針は docs/AUTH.md を参照。トークンは外部送信・永続保存しない。

/**
 * OAuth アクセストークンを取得する。
 * @param interactive 未認証時に同意フローを表示するか（既定: false）
 */
export async function getToken(interactive = false): Promise<string> {
  return new Promise<string>((resolvePromise, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      const err = chrome.runtime.lastError;
      if (err || !token) {
        reject(new Error(err?.message ?? "failed to get auth token"));
        return;
      }
      resolvePromise(token);
    });
  });
}

/**
 * トークンを確実に得る。非対話で取れなければ対話的サインイン（同意画面）にフォールバックする。
 * プレビュー操作（ユーザー操作起点）から呼ぶことで「押す→同意→表示」を実現する。
 */
export async function ensureToken(): Promise<string> {
  try {
    return await getToken(false);
  } catch {
    return await getToken(true);
  }
}

/** 失効したトークンを chrome.identity のキャッシュから除去する。 */
export async function invalidate(token: string): Promise<void> {
  return new Promise<void>((resolvePromise) => {
    chrome.identity.removeCachedAuthToken({ token }, () => resolvePromise());
  });
}

/**
 * キャッシュ済みのアクセストークンをすべて解除する（ローカルのサインアウト相当）。
 * 次回 getToken は再取得になる。
 * ただし Google 側のアプリ許可は残るため、**初回の同意画面まで再現したい場合は**、
 * 併せて https://myaccount.google.com/connections でアプリのアクセスを削除する。
 */
export async function signOut(): Promise<void> {
  return new Promise<void>((resolvePromise) => {
    chrome.identity.clearAllCachedAuthTokens(() => resolvePromise());
  });
}

/**
 * Google 側のアプリ連携（許可）を取り消し、ローカルのトークンも解除する。
 * 次回プレビュー時に「初回の同意画面」が再表示される（開発時の認証フロー再現に使う）。
 * 許可取り消しのため OAuth revoke エンドポイントを叩く（host_permissions に oauth2.googleapis.com が必要）。
 */
export async function revokeAccess(): Promise<void> {
  try {
    const token = await getToken(false);
    await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
      { method: "POST" },
    );
    await invalidate(token);
  } catch {
    // トークンが無い（既に未連携）場合は何もしない
  }
  await signOut();
}

/** サインイン済みか（非対話で取得できるか）を返す。popup の状態表示用。 */
export async function isSignedIn(): Promise<boolean> {
  try {
    await getToken(false);
    return true;
  } catch {
    return false;
  }
}
