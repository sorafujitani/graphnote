import { useEffect, useState } from "react";
import type { ApiTokenAccess, ApiTokenMeta } from "../../shared/types";
import { userMessage } from "../lib/userMessage";
import { api } from "../server/api";
export function useTokens() {
  const [tokens, setTokens] = useState<ApiTokenMeta[]>([]);
  const [name, setName] = useState("自分のパソコン");
  const [access, setAccess] = useState<ApiTokenAccess>("read");
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Same host the page came from, so a local install points at the local worker.
  const origin = window.location.origin;

  async function refresh() {
    const data = await api.listTokens();
    setTokens(data.tokens);
  }

  useEffect(() => {
    void refresh().catch((err) => {
      setError(userMessage(err, "連携キーを読み込めませんでした。もう一度お試しください。"));
    });
  }, []);

  async function onCreate() {
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const result = await api.createToken(name.trim() || "自分のパソコン", access);
      setCreated(result.token);
      await refresh();
    } catch (err) {
      setError(userMessage(err, "連携キーを作成できませんでした。もう一度お試しください。"));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("この連携キーを無効にしますか？利用中のアプリから接続できなくなります。")) return;
    try {
      await api.deleteToken(id);
      await refresh();
    } catch (err) {
      setError(userMessage(err, "連携キーを無効にできませんでした。もう一度お試しください。"));
    }
  }

  return {
    state: { tokens, name, access, created, error, busy, origin },
    actions: { setName, setAccess, onCreate, onDelete },
  };
}

export type TokensController = ReturnType<typeof useTokens>;
