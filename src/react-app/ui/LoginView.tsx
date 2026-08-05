import type { LoginController } from "../logic/useLogin";

type Props = {
  controller: LoginController;
  onOpenLegal: (page: "terms" | "privacy") => void;
};

export function LoginView({ controller, onOpenLegal }: Props) {
  const { state, actions } = controller;

  return (
    <div className="relative grid h-full min-h-screen place-items-center overflow-hidden p-8">
      <div className="landing-bg absolute inset-0 z-0" aria-hidden />
      <main className="relative z-10 grid w-full max-w-[40rem] gap-4">
        <p className="font-brand m-0 text-[clamp(2.5rem,8vw,4.5rem)] leading-none font-bold tracking-[-0.04em]">
          graphnote
        </p>
        <div className="mt-2">
          <button
            className="btn btn-accent"
            type="button"
            disabled={state.busy}
            onClick={() => void actions.onGoogle()}
          >
            {state.busy ? "ログインしています…" : "Googleでログイン"}
          </button>
        </div>
        {state.error ? <p className="m-0 text-danger">{state.error}</p> : null}
        <p className="mt-2 mb-0 text-sm text-muted">
          続行すると、{" "}
          <button
            type="button"
            className="border-0 bg-transparent p-0 text-accent underline underline-offset-2"
            onClick={() => onOpenLegal("terms")}
          >
            利用規約
          </button>{" "}
          と{" "}
          <button
            type="button"
            className="border-0 bg-transparent p-0 text-accent underline underline-offset-2"
            onClick={() => onOpenLegal("privacy")}
          >
            プライバシーポリシー
          </button>
          に同意したものとみなされます。
        </p>
      </main>
    </div>
  );
}
