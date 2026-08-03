import { useEffect, useState } from "react";
import { ApiError, api } from "./api";
import { authClient } from "./lib/auth-client";
import { navigate, parseRoute, type AppRoute } from "./lib/routing";
import { GraphEditor } from "./pages/GraphEditor";
import { GraphList } from "./pages/GraphList";
import { Legal } from "./pages/Legal";
import { Login } from "./pages/Login";
import { Tokens } from "./pages/Tokens";

type Screen = { name: "loading" } | { name: "login" } | AppRoute;

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    const route = parseRoute(window.location.pathname);
    if (route.name === "terms" || route.name === "privacy") {
      setScreen(route);
      return;
    }

    api
      .me()
      .then((data) => {
        if (controller.signal.aborted) return;
        if (!data.authenticated) {
          setScreen({ name: "login" });
          return;
        }
        setScreen(parseRoute(window.location.pathname));
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setScreen({ name: "login" });
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    function onPopState() {
      const route = parseRoute(window.location.pathname);
      if (route.name === "terms" || route.name === "privacy") {
        setScreen(route);
        return;
      }
      setScreen((prev) => {
        if (prev.name === "loading" || prev.name === "login") return prev;
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
      <div className="app-shell" style={{ display: "grid", placeItems: "center" }}>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (screen.name === "terms" || screen.name === "privacy") {
    return (
      <Legal
        kind={screen.name}
        onBack={() => {
          void api
            .me()
            .then(() => go({ name: "list" }, "replace"))
            .catch(() => {
              navigate({ name: "list" }, "replace");
              setScreen({ name: "login" });
            });
        }}
      />
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
        if (!confirm("Delete your account and all notes permanently?")) return;
        try {
          await api.deleteAccount();
        } catch (error) {
          if (!(error instanceof ApiError)) throw error;
        }
        await logout();
      }}
    />
  );
}
