import { CommandLine } from "../components/CommandLine";
import type { TokensController } from "../logic/useTokens";

const dateFormat = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" });
const dateTimeFormat = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
});

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
          戻る
        </button>
        <h1 className="m-0 text-xl font-bold">外部サービスとの連携</h1>
      </header>
      <p className="text-muted">
        他のアプリや端末からボードを利用するための連携キーを作成できます。キーの有効期間は90日です。
      </p>
      {state.error ? <p className="m-0 text-danger">{state.error}</p> : null}
      {state.created ? (
        <div className="panel mb-4 p-4">
          <p className="mt-0 mb-2 font-semibold">このキーは今だけ表示されます</p>
          <code className="break-all font-mono">{state.created}</code>
          <p className="mt-3 mb-[0.35rem] text-sm text-muted">
            コピーして安全な場所に保管してください。コマンドラインでは次のコマンドから設定できます。
          </p>
          <CommandLine command="gqn config set-token" />
        </div>
      ) : null}
      <div className="panel mb-5 grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <label className="grid gap-2 text-sm font-medium">
          キーの名前
          <input
            value={state.name}
            onChange={(event) => actions.setName(event.target.value)}
            placeholder="例：自分のパソコン"
            className="input-surface"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          できること
          <select
            aria-label="連携キーの権限"
            value={state.access}
            onChange={(event) =>
              actions.setAccess(event.target.value === "read" ? "read" : "write")
            }
            className="input-surface"
          >
            <option value="read">見るだけ</option>
            <option value="write">閲覧・編集</option>
          </select>
        </label>
        <button
          className="btn btn-accent accent"
          type="button"
          disabled={state.busy}
          onClick={() => void actions.onCreate()}
        >
          キーを作成
        </button>
      </div>
      <ul className="m-0 list-none p-0">
        {state.tokens.map((token) => (
          <li
            key={token.id}
            className="flex items-start justify-between gap-4 border-b border-line py-3"
          >
            <div>
              <div>{token.name || "名前のないキー"}</div>
              <div className="text-sm text-muted">
                {`${dateTimeFormat.format(new Date(token.created_at))}に作成`}
                {` · ${token.scopes.includes("graph:write") ? "閲覧・編集" : "見るだけ"}`}
                {` · ${dateFormat.format(new Date(token.expires_at))}まで`}
                {token.last_used_at
                  ? ` · 最終利用 ${dateTimeFormat.format(new Date(token.last_used_at))}`
                  : ""}
              </div>
            </div>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => void actions.onDelete(token.id)}
            >
              無効にする
            </button>
          </li>
        ))}
      </ul>
      {state.tokens.length === 0 && !state.created ? (
        <p className="text-sm text-muted">
          連携キーはまだありません。必要になったときに作成できます。
        </p>
      ) : null}

      <details className="install-panel panel mt-6 p-4">
        <summary className="cursor-pointer font-semibold">開発者向けの設定を見る</summary>
        <div className="mt-4 grid gap-[0.6rem]">
          <p className="m-0 text-sm text-muted">
            コマンドラインやAIエージェントからgraphnoteを使うための設定です。Node.js
            20以上が必要です。
          </p>
          <CommandLine
            command={`curl -fsSL ${state.origin}/install.sh | sh`}
            hint="gqnコマンドをインストールします。"
          />
          <CommandLine
            command="npx skills add sorafujitani/graphnote"
            hint="AIエージェントにgraphnoteの操作スキルを追加します。"
          />
          <CommandLine command="gqn graphs list" hint="連携できたことを確認します。" />
        </div>
      </details>
    </div>
  );
}
