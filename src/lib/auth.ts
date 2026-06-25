// chrome.identity.launchWebAuthFlow による OAuth トークン管理（implicit flow）
// 方針・背景は docs/AUTH.md を参照。トークンは外部送信せず、再利用は chrome.storage.session のみ。
//
// getAuthToken は Google の「OAuth カスタム URI スキーム制限」により
// 「Error 400: invalid_request / Custom URI scheme is not supported on Chrome apps」で
// 失敗する（とくに Chrome 以外の Chromium ブラウザ）。そのため launchWebAuthFlow に移行している。

// Web アプリケーション型 OAuth クライアント ID（公開値）。ビルド時に build.mjs が注入する
// （dev: DWP_DEV_CLIENT_ID / release: DWP_RELEASE_CLIENT_ID、いずれも .env.local 由来）。
// 管理者が Google Cloud Console で「ウェブ アプリケーション(Web application)」型として作成し、
// 「承認済みのリダイレクト URI」に chrome.identity.getRedirectURL() の値
// （https://<拡張機能ID>.chromiumapp.org/）を登録すること。手順は docs/SETUP_OAUTH.md。
// 注意: 旧来の「Chrome 拡張機能」型クライアント ID では launchWebAuthFlow は通らない。
const OAUTH_CLIENT_ID = __OAUTH_CLIENT_ID__;
// 「Web プレビュー」ボタンで現在開いているフォルダ ID から即プレビューするため drive.readonly を使う。
// スコープ変更は人間が判断する（CLAUDE.md）。一般公開時は restricted スコープのため CASA が必要。
const OAUTH_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

/** 取得済みトークンの保存キー（chrome.storage.session）。 */
const TOKEN_STORAGE_KEY = "dwp_oauth_token";
/** 失効判定の安全マージン（ミリ秒）。期限ギリギリのトークンを使わない。 */
const EXPIRY_SKEW_MS = 60_000;
/** expires_in が得られないときのフォールバック有効期間（秒）。 */
const DEFAULT_EXPIRES_IN = 3600;

interface StoredToken {
  accessToken: string;
  /** epoch ミリ秒。 */
  expiresAt: number;
}

async function readStoredToken(): Promise<StoredToken | null> {
  const obj = await chrome.storage.session.get(TOKEN_STORAGE_KEY);
  const t = obj[TOKEN_STORAGE_KEY] as StoredToken | undefined;
  if (t && typeof t.accessToken === "string" && typeof t.expiresAt === "number") {
    return t;
  }
  return null;
}

async function writeStoredToken(token: StoredToken | null): Promise<void> {
  if (token) {
    await chrome.storage.session.set({ [TOKEN_STORAGE_KEY]: token });
  } else {
    await chrome.storage.session.remove(TOKEN_STORAGE_KEY);
  }
}

function isValid(token: StoredToken | null): token is StoredToken {
  return token !== null && token.expiresAt - EXPIRY_SKEW_MS > Date.now();
}

/** implicit flow の認可 URL を組み立てる。 */
function buildAuthUrl(interactive: boolean): string {
  const params = new URLSearchParams({
    client_id: OAUTH_CLIENT_ID,
    response_type: "token",
    redirect_uri: chrome.identity.getRedirectURL(),
    scope: OAUTH_SCOPES.join(" "),
  });
  // 非対話時は UI を出さずに（既存セッションがあれば）サイレント取得する。
  if (!interactive) params.set("prompt", "none");
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/** launchWebAuthFlow を Promise でラップし、リダイレクト URL を返す。 */
function launchFlow(interactive: boolean): Promise<string> {
  return new Promise<string>((resolvePromise, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: buildAuthUrl(interactive), interactive },
      (responseUrl) => {
        const err = chrome.runtime.lastError;
        if (err || !responseUrl) {
          reject(new Error(err?.message ?? "auth flow failed"));
          return;
        }
        resolvePromise(responseUrl);
      },
    );
  });
}

/** リダイレクト URL のフラグメント（またはクエリ）からトークン/エラーを取り出す。 */
function parseRedirect(responseUrl: string): StoredToken {
  const url = new URL(responseUrl);
  // implicit flow はフラグメント（#）に access_token / expires_in を載せる。
  const frag = new URLSearchParams(url.hash.replace(/^#/, ""));
  // エラーはフラグメント／クエリどちらにも来うる。error_description があれば原因を添える。
  const error = frag.get("error") ?? url.searchParams.get("error");
  if (error) {
    const desc = frag.get("error_description") ?? url.searchParams.get("error_description");
    throw new Error(`oauth error: ${error}${desc ? `: ${desc}` : ""}`);
  }

  const accessToken = frag.get("access_token");
  if (!accessToken) throw new Error("no access_token in response");

  const expiresIn = Number(frag.get("expires_in") ?? DEFAULT_EXPIRES_IN);
  const ttl = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : DEFAULT_EXPIRES_IN;
  return { accessToken, expiresAt: Date.now() + ttl * 1000 };
}

/**
 * OAuth アクセストークンを取得する。
 * 有効なキャッシュがあれば再利用し、無ければ launchWebAuthFlow で取得・キャッシュする。
 * 「Web プレビュー」起点で初回のみ同意を出すため、background からは `ensureToken()` を使う。
 * @param interactive 未認証時に同意/アカウント選択フローを表示するか（既定: false）
 */
export async function getToken(interactive = false): Promise<string> {
  const cached = await readStoredToken();
  if (isValid(cached)) return cached.accessToken;

  const token = parseRedirect(await launchFlow(interactive));
  await writeStoredToken(token);
  return token.accessToken;
}

/**
 * トークンを確実に得る。非対話で取れなければ対話的サインイン（同意画面）にフォールバックする。
 * 「Web プレビュー」操作（ユーザー操作起点）から呼ぶことで「押す→（初回のみ同意）→表示」を実現する。
 */
export async function ensureToken(): Promise<string> {
  try {
    return await getToken(false);
  } catch {
    return await getToken(true);
  }
}

/** 失効したトークンをキャッシュから除去する。drive-api が 401 時に呼ぶ。 */
export async function invalidate(token: string): Promise<void> {
  const cached = await readStoredToken();
  if (!cached || cached.accessToken === token) {
    await writeStoredToken(null);
  }
}

/**
 * キャッシュ済みのアクセストークンを破棄する（ローカルのサインアウト相当）。
 * 次回 getToken は再取得になる。
 * ただし Google 側のアプリ許可は残るため、初回の同意画面まで再現したい場合は併せて
 * https://myaccount.google.com/connections でアプリのアクセスを削除する。
 */
export async function signOut(): Promise<void> {
  await writeStoredToken(null);
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
