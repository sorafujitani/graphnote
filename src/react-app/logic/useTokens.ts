import { useEffect, useState } from "react";
import type { ApiTokenAccess, ApiTokenMeta } from "../../shared/types";
import { useConfirm } from "./useConfirm";
import { userMessage } from "../lib/userMessage";
import { api } from "../server/api";
export function useTokens() {
  const [tokens, setTokens] = useState<ApiTokenMeta[]>([]);
  const [name, setName] = useState("自分のパソコン");
  const [access, setAccess] = useState<ApiTokenAccess>("read");
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { pending: confirmDialog, confirm } = useConfirm();
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
    const token = tokens.find((item) => item.id === id);
    if (!token) return;
    const ok = await confirm({
      title: "連携キーを無効化",
      message: `「${token.name || "名前のないキー"}」を無効にします。利用中のアプリから接続できなくなります。`,
      confirmLabel: "無効にする",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteToken(id);
      await refresh();
    } catch (err) {
      setError(userMessage(err, "連携キーを無効にできませんでした。もう一度お試しください。"));
    }
  }

  return {
    state: { tokens, name, access, created, error, busy, origin, confirmDialog },
    actions: { setName, setAccess, onCreate, onDelete },
  };
}

export type TokensController = ReturnType<typeof useTokens>;
