import { CommandLine } from "../components/CommandLine";
import type { TokensController } from "../logic/useTokens";

type Props = {
  controller: TokensController;
  onBack: () => void;
};

export function TokensView({ controller, onBack }: Props) {
  const { state, actions } = controller;

  return (
    <div className="mx-auto h-full min-h-screen max-w-[720px] p-6">
      <header className="flex items-center gap-3">
        <button className="btn btn-ghost" type="button" onClick={onBack}>
          Back
        </button>
        <h1 className="m-0 text-xl font-bold">Integrations</h1>
      </header>
      <p className="text-muted">
        Create a 90-day access key for another app or device. Copy it when shown — we cannot display
        it again.
      </p>
      {state.error ? <p className="m-0 text-danger">{state.error}</p> : null}
      {state.created ? (
        <div className="panel mb-4 p-4">
          <p className="mt-0 mb-2">Copy this key now:</p>
          <code className="break-all font-mono">{state.created}</code>
          <p className="mt-3 mb-[0.35rem] text-sm text-muted">
            Then run this and paste the key into the hidden prompt:
          </p>
          <CommandLine command="gqn config set-token" />
        </div>
      ) : null}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={state.name}
          onChange={(event) => actions.setName(event.target.value)}
          placeholder="Label (e.g. My laptop)"
          className="input-surface flex-1"
        />
        <select
          aria-label="Access level"
          value={state.access}
          onChange={(event) => actions.setAccess(event.target.value === "read" ? "read" : "write")}
          className="input-surface"
        >
          <option value="read">Read only</option>
          <option value="write">Read &amp; write</option>
        </select>
        <button
          className="btn btn-accent accent"
          type="button"
          disabled={state.busy}
          onClick={() => void actions.onCreate()}
        >
          Create key
        </button>
      </div>
      <ul className="m-0 list-none p-0">
        {state.tokens.map((token) => (
          <li
            key={token.id}
            className="flex items-start justify-between gap-4 border-b border-line py-3"
          >
            <div>
              <div>{token.name || "Unnamed"}</div>
              <div className="text-sm text-muted">
                Created {new Date(token.created_at).toLocaleString()}
                {` · ${token.scopes.includes("graph:write") ? "Read & write" : "Read only"}`}
                {` · Expires ${new Date(token.expires_at).toLocaleDateString()}`}
                {token.last_used_at
                  ? ` · Last used ${new Date(token.last_used_at).toLocaleString()}`
                  : ""}
              </div>
            </div>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => void actions.onDelete(token.id)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <section className="install-panel panel mt-6 grid gap-[0.6rem] p-4">
        <h2 className="m-0 text-base font-bold">Command line &amp; agent skills</h2>
        <p className="m-0 text-sm text-muted">
          One command installs the <code>gqn</code> CLI, one adds the agent skills. Needs Node.js
          20+.
        </p>
        <CommandLine
          command={`curl -fsSL ${state.origin}/install.sh | sh`}
          hint="Installs gqn into ~/.local/bin and the bundle into ~/.local/share/graphnote."
        />
        <CommandLine
          command="npx skills add sorafujitani/graphnote"
          hint="Adds gqn · gqn-teach · gqn-node-refactor to your agent. -g installs globally, --agent picks the agent, npx skills update refreshes them."
        />
        <CommandLine command="gqn graphs list" hint="Check the key works for its bound host." />
      </section>
    </div>
  );
}
