import { useEffect, useState } from "react";
import { oauthErrorMessage, userMessage } from "../lib/userMessage";
import { authClient } from "../server/auth";

function readOauthError(): string | null {
  if (typeof window === "undefined") return null;
  return oauthErrorMessage(window.location.search);
}

export function useLogin() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(readOauthError);

  // Keeps a failed sign-in out of the URL, so a reload starts clean. Stripping it
  // in an effect keeps the render phase free of history mutations.
  useEffect(() => {
    if (readOauthError()) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  // Going back from Google restores this page from the back/forward cache with
  // React state intact, including a `busy` that no longer has a redirect behind it.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  async function onGoogle() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const failed = (err: unknown) => {
      setError(userMessage(err, "ログインできませんでした。時間をおいてもう一度お試しください。"));
      setBusy(false);
    };
    try {
      // The client resolves with `{ error }` instead of throwing, and on success
      // it is already navigating to Google — keep the button disabled so a second
      // flow cannot overwrite this one's state cookie.
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: window.location.pathname || "/",
      });
      if (result.error) failed(new Error(result.error.message ?? result.error.statusText));
    } catch (err) {
      failed(err);
    }
  }

  return {
    state: { busy, error },
    actions: { onGoogle },
  };
}

export type LoginController = ReturnType<typeof useLogin>;
