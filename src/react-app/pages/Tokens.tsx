import { useEffect, useState } from "react";
import type { ApiTokenMeta } from "../../shared/types";
import { ApiError, api } from "../api";
import { CommandLine } from "../components/CommandLine";

type Props = {
  onBack: () => void;
};

export function Tokens({ onBack }: Props) {
  const [tokens, setTokens] = useState<ApiTokenMeta[]>([]);
  const [name, setName] = useState("My device");
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
      const result = await api.createToken(name.trim() || "My device");
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

  return (
    <div className="app-shell" style={{ padding: "1.5rem", maxWidth: 720, margin: "0 auto" }}>
      <header style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
        <button className="btn ghost" type="button" onClick={onBack}>
          Back
        </button>
        <h1 style={{ margin: 0, fontSize: "1.25rem" }}>Integrations</h1>
      </header>
      <p className="muted">
        Create an access key to connect graphnote from another app or device. Copy it when shown —
        we cannot display it again.
      </p>
      {error ? <p className="error">{error}</p> : null}
      {created ? (
        <div className="panel" style={{ padding: "1rem", marginBottom: "1rem" }}>
          <p style={{ margin: "0 0 0.5rem" }}>Copy this key now:</p>
          <code style={{ wordBreak: "break-all" }}>{created}</code>
          <p className="muted" style={{ margin: "0.75rem 0 0.35rem", fontSize: "0.85rem" }}>
            Then point the CLI at it:
          </p>
          <CommandLine command={`gqn config set-token ${created}`} />
        </div>
      ) : null}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Label (e.g. My laptop)"
          style={{ flex: 1 }}
        />
        <button
          className="btn accent"
          type="button"
          disabled={busy}
          onClick={() => void onCreate()}
        >
          Create key
        </button>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {tokens.map((token) => (
          <li
            key={token.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "1rem",
              padding: "0.75rem 0",
              borderBottom: "1px solid color-mix(in oklab, currentColor 12%, transparent)",
            }}
          >
            <div>
              <div>{token.name || "Unnamed"}</div>
              <div className="muted" style={{ fontSize: "0.85rem" }}>
                Created {new Date(token.created_at).toLocaleString()}
                {token.last_used_at
                  ? ` · Last used ${new Date(token.last_used_at).toLocaleString()}`
                  : ""}
              </div>
            </div>
            <button className="btn secondary" type="button" onClick={() => void onDelete(token.id)}>
              Remove
            </button>
          </li>
        ))}
      </ul>

      <section className="panel install-panel">
        <h2 className="install-title">Command line &amp; agent skills</h2>
        <p className="muted install-lead">
          One command installs the <code>gqn</code> CLI, one adds the agent skills. Needs Node.js
          20+.
        </p>
        <CommandLine
          command={`curl -fsSL ${origin}/install.sh | sh`}
          hint={`Installs gqn into ~/.local/bin and the bundle into ~/.local/share/graphnote.`}
        />
        <CommandLine
          command="npx skills add sorafujitani/graphnote"
          hint="Adds gqn · gqn-teach · gqn-node-refactor to your agent. -g installs globally, --agent picks the agent, npx skills update refreshes them."
        />
        <CommandLine command="gqn graphs list" hint="Check the key works." />
      </section>
    </div>
  );
}
