import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { failed: boolean };

/** Last line of defence: a render error shows a reload card instead of a blank page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("render error", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="landing-bg grid h-full min-h-screen place-items-center p-5">
        <section className="panel w-full max-w-md px-7 py-8 text-center" role="alert">
          <h1 className="mt-0 mb-2 font-brand text-2xl font-bold">画面を表示できませんでした</h1>
          <p className="mt-0 mb-6 text-sm leading-relaxed text-muted">
            保存済みの内容は失われていません。再読み込みで復帰しない場合は、フィードバックからお知らせください。
          </p>
          <div className="flex justify-center gap-2">
            <button
              className="btn btn-accent"
              type="button"
              onClick={() => window.location.reload()}
            >
              再読み込み
            </button>
            <a
              className="btn btn-secondary"
              href="https://github.com/sorafujitani/graphnote/issues"
              target="_blank"
              rel="noreferrer"
            >
              フィードバック
            </a>
          </div>
        </section>
      </main>
    );
  }
}
