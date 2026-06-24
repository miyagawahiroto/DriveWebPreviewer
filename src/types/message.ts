// content / popup ⇄ background のメッセージ型
// 種別（type）は CLAUDE.md の規約により snake_case で統一する。

/** プレビュー開始要求（content / popup → background） */
export interface StartPreviewMessage {
  type: "start_preview";
  fileId: string;
  parentId: string;
  fileName: string;
}

/** デモプレビュー開始要求（popup → background。OAuth 不要） */
export interface StartDemoMessage {
  type: "start_demo";
}

/** 認証状態の問い合わせ（popup → background） */
export interface GetAuthStateMessage {
  type: "get_auth_state";
}

/** サインイン要求（popup → background。対話的フローを起動） */
export interface SignInMessage {
  type: "sign_in";
}

/** background が受け取りうるメッセージの集合 */
export type RequestMessage =
  | StartPreviewMessage
  | StartDemoMessage
  | GetAuthStateMessage
  | SignInMessage;

/** プレビュー開始の応答 */
export interface StartPreviewResponse {
  ok: boolean;
  error?: string;
}

/** 認証状態の応答 */
export interface AuthStateResponse {
  signedIn: boolean;
}

export type ResponseMessage = StartPreviewResponse | AuthStateResponse;

/** 型ガード */
export function isRequestMessage(value: unknown): value is RequestMessage {
  if (typeof value !== "object" || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === "start_preview" ||
    type === "start_demo" ||
    type === "get_auth_state" ||
    type === "sign_in"
  );
}
