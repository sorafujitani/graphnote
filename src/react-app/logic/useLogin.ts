import { useState } from "react";
import { userMessage } from "../lib/userMessage";
import { authClient } from "../server/auth";

export function useLogin() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGoogle() {
    setBusy(true);
    setError(null);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: window.location.pathname || "/",
      });
    } catch (err) {
      setError(userMessage(err, "ログインできませんでした。時間をおいてもう一度お試しください。"));
    } finally {
      setBusy(false);
    }
  }

  return {
    state: { busy, error },
    actions: { onGoogle },
  };
}

export type LoginController = ReturnType<typeof useLogin>;
