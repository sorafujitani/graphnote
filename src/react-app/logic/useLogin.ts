import { useState } from "react";
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
      setError(err instanceof Error ? err.message : "sign-in failed");
      setBusy(false);
    }
  }

  return {
    state: { busy, error },
    actions: { onGoogle },
  };
}

export type LoginController = ReturnType<typeof useLogin>;
