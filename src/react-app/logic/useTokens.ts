import { useEffect, useState } from "react";
import type { ApiTokenAccess, ApiTokenMeta } from "../../shared/types";
import { ApiError, api } from "../server/api";
export function useTokens() {
  const [tokens, setTokens] = useState<ApiTokenMeta[]>([]);
  const [name, setName] = useState("My device");
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
      setError(err instanceof ApiError ? err.message : "Could not load access keys");
    });
  }, []);

  async function onCreate() {
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const result = await api.createToken(name.trim() || "My device", access);
      setCreated(result.token);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create access key");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Remove this access key? Apps using it will stop working.")) return;
    try {
      await api.deleteToken(id);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove access key");
    }
  }

  return {
    state: { tokens, name, access, created, error, busy, origin },
    actions: { setName, setAccess, onCreate, onDelete },
  };
}

export type TokensController = ReturnType<typeof useTokens>;
