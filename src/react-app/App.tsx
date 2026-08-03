import { useEffect, useState } from "react";
import { ApiError, api } from "./api";
import { navigate, parseRoute, type AppRoute } from "./lib/routing";
import { GraphEditor } from "./pages/GraphEditor";
import { GraphList } from "./pages/GraphList";
import { Login } from "./pages/Login";

type Screen = { name: "loading" } | { name: "login" } | AppRoute;

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    api
      .me()
      .then((data) => {
        if (controller.signal.aborted) return;
        if (!data.authenticated) {
          setScreen({ name: "login" });
          return;
        }
        // Keep deep link on reload (e.g. /g/<id>).
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
      setScreen((prev) => {
        if (prev.name === "loading" || prev.name === "login") return prev;
        return parseRoute(window.location.pathname);
      });
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function go(route: AppRoute, mode: "push" | "replace" = "push") {
    navigate(route, mode);
    setScreen(route);
  }

  if (screen.name === "loading") {
    return (
      <div className="app-shell" style={{ display: "grid", placeItems: "center" }}>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (screen.name === "login") {
    return (
      <Login
        onSuccess={() => {
          go(parseRoute(window.location.pathname), "replace");
        }}
      />
    );
  }

  if (screen.name === "editor") {
    return (
      <GraphEditor
        graphId={screen.graphId}
        onBack={() => go({ name: "list" })}
        onLogout={async () => {
          await api.logout();
          navigate({ name: "list" }, "replace");
          setScreen({ name: "login" });
        }}
      />
    );
  }

  return (
    <GraphList
      onOpen={(graphId) => go({ name: "editor", graphId })}
      onLogout={async () => {
        try {
          await api.logout();
        } catch (error) {
          if (!(error instanceof ApiError)) throw error;
        }
        navigate({ name: "list" }, "replace");
        setScreen({ name: "login" });
      }}
    />
  );
}
