import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "./server/api";
import { authClient } from "./server/auth";
import { userMessage } from "./lib/userMessage";
import { navigate, parseRoute, type AppRoute } from "./lib/routing";
import { GraphEditor } from "./pages/GraphEditor";
import { GraphList } from "./pages/GraphList";
import { Legal } from "./pages/Legal";
import { Login } from "./pages/Login";
import { Tokens } from "./pages/Tokens";

type Screen =
  | { name: "loading" }
  | { name: "login" }
  | { name: "unavailable"; detail: string }
  | AppRoute;

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "loading" });

  const checkSession = useCallback(async () => {
    setScreen({ name: "loading" });
    try {
      const data = await api.me();
      if (!data.authenticated) {
        setScreen({ name: "login" });
        return;
      }
      setScreen(parseRoute(window.location.pathname));
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
    const route = parseRoute(window.location.pathname);
    if (route.name === "terms" || route.name === "privacy") {
      setScreen(route);
      return;
    }

    void checkSession();
  }, [checkSession]);

  useEffect(() => {
    function onUnauthorized() {
      // The URL is left as-is so the deep link survives a re-login.
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
      const route = parseRoute(window.location.pathname);
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
    navigate({ name: "list" }, "replace");
    setScreen({ name: "login" });
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
        onBack={() => go({ name: "list" })}
        onLogout={() => void logout()}
      />
    );
  }

  return (
    <GraphList
      onOpen={(graphId) => go({ name: "editor", graphId })}
      onLogout={() => void logout()}
      onOpenTokens={() => go({ name: "tokens" })}
      onDeleteAccount={async () => {
        if (!confirm("アカウントとすべてのノートを完全に削除しますか？この操作は取り消せません。"))
          return;
        try {
          await api.deleteAccount();
        } catch (error) {
          // Logging out here would make a failed deletion look like it worked.
          const detail =
            error instanceof ApiError
              ? userMessage(error, "アカウントを削除できませんでした。")
              : "アカウントを削除できませんでした。";
          alert(`${detail} データはまだ残っています。もう一度お試しください。`);
          return;
        }
        await logout();
      }}
    />
  );
}
