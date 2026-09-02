import { useCallback, useEffect, useState } from "react";
import type { PublicUser } from "../shared/types";
import { AlertDialog, ConfirmDialog } from "./components/Dialog";
import { useConfirm } from "./logic/useConfirm";
import { documentTitle, navigate, parseRoute, type AppRoute } from "./lib/routing";
import { userMessage } from "./lib/userMessage";
import { GraphEditor } from "./pages/GraphEditor";
import { GraphList } from "./pages/GraphList";
import { Legal } from "./pages/Legal";
import { Login } from "./pages/Login";
import { Tokens } from "./pages/Tokens";
import { EditorHelpDialog } from "./ui/graph-editor/EditorDialogs";
import { ApiError, api } from "./server/api";
import { authClient } from "./server/auth";

type Screen =
  | { name: "loading" }
  | { name: "login" }
  | { name: "unavailable"; detail: string }
  | AppRoute;

function editorRoute(graphId: string, nodeId?: string): AppRoute {
  return nodeId ? { name: "editor", graphId, nodeId } : { name: "editor", graphId };
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "loading" });
  const [user, setUser] = useState<PublicUser | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const { pending: accountConfirmation, confirm: requestAccountConfirmation } = useConfirm();

  const checkSession = useCallback(async () => {
    setScreen({ name: "loading" });
    setUser(null);
    try {
      const data = await api.me();
      if (!data.authenticated) {
        setUser(null);
        setScreen({ name: "login" });
        return;
      }
      setUser(data.user ?? null);
      setScreen(parseRoute(window.location.pathname, window.location.search));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setScreen({ name: "login" });
        return;
      }
      setScreen({
        name: "unavailable",
        detail: "Graphnoteに接続できません。通信環境を確認して、もう一度お試しください。",
      });
    }
  }, []);

  useEffect(() => {
    const route = parseRoute(window.location.pathname, window.location.search);
    if (route.name === "terms" || route.name === "privacy") {
      setScreen(route);
      return;
    }

    void checkSession();
  }, [checkSession]);

  useEffect(() => {
    function onUnauthorized() {
      // The URL is left as-is so the deep link survives a re-login.
      setUser(null);
      setScreen((prev) =>
        prev.name === "terms" || prev.name === "privacy" || prev.name === "login"
          ? prev
          : { name: "login" },
      );
    }
    window.addEventListener("graphnote:unauthorized", onUnauthorized);
    return () => window.removeEventListener("graphnote:unauthorized", onUnauthorized);
  }, []);

  useEffect(() => {
    function onPopState() {
      const route = parseRoute(window.location.pathname, window.location.search);
      if (route.name === "terms" || route.name === "privacy") {
        setScreen(route);
        return;
      }
      setScreen((prev) => {
        if (prev.name === "loading" || prev.name === "login" || prev.name === "unavailable")
          return prev;
        return route;
      });
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    document.title = documentTitle(screen.name);
  }, [screen]);

  function go(route: AppRoute, mode: "push" | "replace" = "push") {
    navigate(route, mode);
    setScreen(route);
  }

  async function logout() {
    try {
      await authClient.signOut();
    } catch {
      /* ignore */
    }
    setUser(null);
    navigate({ name: "list" }, "replace");
    setScreen({ name: "login" });
  }

  async function deleteAccount() {
    const ok = await requestAccountConfirmation({
      title: "アカウントを削除",
      message: "アカウントとすべてのノートを完全に削除します。この操作は取り消せません。",
      confirmLabel: "完全に削除する",
      danger: true,
    });
    if (!ok) return;
    setAccountError(null);
    try {
      await api.deleteAccount();
    } catch (error) {
      const detail =
        error instanceof ApiError
          ? userMessage(error, "アカウントを削除できませんでした。")
          : "アカウントを削除できませんでした。";
      setAccountError(`${detail} データはまだ残っています。もう一度お試しください。`);
      return;
    }
    await logout();
  }

  if (screen.name === "loading") {
    return (
      <div className="grid h-full min-h-screen place-items-center">
        <p className="text-muted">準備しています…</p>
      </div>
    );
  }

  if (screen.name === "terms" || screen.name === "privacy") {
    return (
      <Legal
        kind={screen.name}
        onBack={() => {
          navigate({ name: "list" }, "replace");
          void checkSession();
        }}
      />
    );
  }

  if (screen.name === "unavailable") {
    return (
      <main className="landing-bg grid h-full min-h-screen place-items-center p-5">
        <section className="panel w-full max-w-md px-7 py-8 text-center" role="alert">
          <p className="m-0 text-xs font-semibold tracking-[0.1em] text-accent">CONNECTION</p>
          <h1 className="mt-3 mb-2 font-brand text-2xl font-bold">接続を確認してください</h1>
          <p className="mt-0 mb-6 text-sm leading-relaxed text-muted">{screen.detail}</p>
          <button className="btn btn-accent" type="button" onClick={() => void checkSession()}>
            再試行
          </button>
        </section>
      </main>
    );
  }

  if (screen.name === "notFound") {
    return (
      <main className="landing-bg grid h-full min-h-screen place-items-center p-5">
        <section className="panel w-full max-w-md px-7 py-8 text-center" role="alert">
          <p className="m-0 text-xs font-semibold tracking-[0.1em] text-accent">404</p>
          <h1 className="mt-3 mb-2 font-brand text-2xl font-bold">ページが見つかりません</h1>
          <p className="mt-0 mb-6 text-sm leading-relaxed text-muted">
            指定されたページは存在しないか、移動した可能性があります。
          </p>
          <button className="btn btn-accent" type="button" onClick={() => go({ name: "list" })}>
            ノート一覧へ
          </button>
        </section>
      </main>
    );
  }

  if (screen.name === "login") {
    return (
      <Login
        onOpenLegal={(page) => {
          go({ name: page });
        }}
      />
    );
  }

  if (screen.name === "tokens") {
    return <Tokens onBack={() => go({ name: "list" })} />;
  }

  if (screen.name === "editor") {
    return (
      <GraphEditor
        graphId={screen.graphId}
        focusNodeId={screen.nodeId}
        user={user}
        onBack={() => go({ name: "list" })}
        onLogout={() => void logout()}
        onOpenTokens={() => go({ name: "tokens" })}
      />
    );
  }

  return (
    <>
      <GraphList
        user={user}
        onOpen={(graphId, nodeId) => go(editorRoute(graphId, nodeId))}
        onLogout={() => void logout()}
        onOpenTokens={() => go({ name: "tokens" })}
        onOpenHelp={() => setHelpOpen(true)}
        onDeleteAccount={() => void deleteAccount()}
      />
      {helpOpen ? <EditorHelpDialog onClose={() => setHelpOpen(false)} /> : null}
      {accountConfirmation ? (
        <ConfirmDialog
          title={accountConfirmation.title}
          message={accountConfirmation.message}
          confirmLabel={accountConfirmation.confirmLabel}
          danger={accountConfirmation.danger}
          onResolve={accountConfirmation.resolve}
        />
      ) : null}
      {accountError ? (
        <AlertDialog
          title="アカウントを削除できませんでした"
          message={accountError}
          onClose={() => setAccountError(null)}
        />
      ) : null}
    </>
  );
}
