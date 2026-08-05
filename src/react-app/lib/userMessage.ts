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
  return API_MESSAGES[message] ?? fallback;
}
