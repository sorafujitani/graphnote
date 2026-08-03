import { useState } from "react";
import { authClient } from "../lib/auth-client";

type Props = {
  onOpenLegal: (page: "terms" | "privacy") => void;
};

export function Login({ onOpenLegal }: Props) {
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

  return (
    <div className="app-shell landing">
      <div className="landing-bg" aria-hidden />
      <main className="landing-main">
        <p className="landing-brand">graphnote</p>
        <h1 className="landing-title">Connect your ideas on a canvas</h1>
        <p className="landing-lead">
          Personal notes that follow how you think — short cues, links between topics, and room to
          grow without turning into long documents.
        </p>
        <div className="landing-actions">
          <button
            className="btn accent"
            type="button"
            disabled={busy}
            onClick={() => void onGoogle()}
          >
            {busy ? "Signing in…" : "Sign in with Google"}
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <p className="landing-legal muted">
          By continuing you agree to the{" "}
          <button type="button" className="linkish" onClick={() => onOpenLegal("terms")}>
            Terms
          </button>{" "}
          and{" "}
          <button type="button" className="linkish" onClick={() => onOpenLegal("privacy")}>
            Privacy
          </button>
          .
        </p>
      </main>
    </div>
  );
}
