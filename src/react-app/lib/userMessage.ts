const API_MESSAGES: Record<string, string> = {
  unauthorized: "ログインの有効期限が切れました。もう一度ログインしてください。",
  "browser session required": "この操作はブラウザからログインして行ってください。",
  "API token required": "連携キーが確認できませんでした。もう一度設定してください。",
  "rate limited": "操作が続いています。少し待ってからもう一度お試しください。",
  "not found": "対象が見つかりませんでした。画面を更新してお試しください。",
  "create failed": "作成できませんでした。もう一度お試しください。",
  "import failed": "読み込めませんでした。ファイルを確認してもう一度お試しください。",
  "unsupported export version": "このダウンロードファイルの形式には対応していません。",
  "invalid export payload": "ダウンロードファイルの内容を確認できませんでした。",
};

export function userMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : null;
  if (!message) return fallback;
  if (message.startsWith("token scope required:")) {
    return "この連携キーでは操作できません。連携設定で権限を確認してください。";
  }
  // `Object.hasOwn`: a message like "constructor" must not resolve a prototype member.
  return Object.hasOwn(API_MESSAGES, message) ? API_MESSAGES[message] : fallback;
}

/**
 * Codes Better Auth appends to the sign-in error redirect. `state_mismatch`
 * means the browser came back without the state cookie it was given — a second
 * login tab, a back-button retry, or the Google step finishing in a different
 * browser — so the recovery is always "start the login again here".
 */
const OAUTH_MESSAGES: Record<string, string> = {
  state_mismatch: "ログインの途中で情報が失われました。このページでもう一度ログインしてください。",
  state_not_found: "ログインの途中で情報が失われました。このページでもう一度ログインしてください。",
  state_invalid: "ログインの途中で情報が失われました。このページでもう一度ログインしてください。",
  access_denied: "Googleでの許可が完了しませんでした。もう一度ログインしてください。",
};

/** Reads `?error=<code>` from a sign-in failure redirect. */
export function oauthErrorMessage(search: string): string | null {
  const code = new URLSearchParams(search).get("error");
  if (!code) return null;
  const fallback = "ログインできませんでした。もう一度お試しください。";
  // The code comes from the URL, so an inherited key like `__proto__` must not match.
  return Object.hasOwn(OAUTH_MESSAGES, code) ? OAUTH_MESSAGES[code] : fallback;
}
