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
  "internal error": "サーバーでエラーが発生しました。時間をおいてもう一度お試しください。",
  "request body too large": "データが大きすぎて送信できませんでした。",
  "cannot link a node to itself": "同じノード同士はつなげません。",
  "nodes already linked": "このノードはすでにつながっています。",
  "node not found": "つなぐ相手のノードが見つかりませんでした。画面を更新してお試しください。",
  "invalid node width": "ノードの大きさを保存できませんでした。",
  "invalid node height": "ノードの大きさを保存できませんでした。",
};

/** Quota errors carry the limit value (e.g. "node limit (500)"), so match by prefix. */
const API_MESSAGE_PREFIXES: Array<[string, string]> = [
  ["token scope required:", "この連携キーでは操作できません。連携設定で権限を確認してください。"],
  ["graph limit", "ノートの上限に達しました。不要なノートを削除してからお試しください。"],
  ["node limit", "ノードの上限に達しました。不要なノードを削除してからお試しください。"],
  ["edge limit", "つながりの上限に達しました。不要なつながりを削除してからお試しください。"],
  ["body too long", "本文が長すぎて保存できません。内容を分割してください。"],
  ["title too long", "タイトルが長すぎて保存できません。"],
  ["token limit", "連携キーの上限に達しました。使っていないキーを削除してください。"],
];

export function userMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : null;
  if (!message) return fallback;
  for (const [prefix, text] of API_MESSAGE_PREFIXES) {
    if (message.startsWith(prefix)) return text;
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
