export type AppRoute =
  | { name: "list" }
  | { name: "editor"; graphId: string; nodeId?: string }
  | { name: "terms" }
  | { name: "privacy" }
  | { name: "tokens" }
  | { name: "notFound"; path: string };

/** Path → screen. Legal pages are public; editor/list require auth at App level. */
export function parseRoute(pathname: string, search = ""): AppRoute {
  if (pathname === "/" || pathname === "") return { name: "list" };
  if (pathname === "/terms" || pathname === "/terms/") return { name: "terms" };
  if (pathname === "/privacy" || pathname === "/privacy/") return { name: "privacy" };
  if (pathname === "/integrations" || pathname === "/integrations/") return { name: "tokens" };
  if (pathname === "/tokens" || pathname === "/tokens/") return { name: "tokens" };
  const match = /^\/g\/([^/]+)\/?$/.exec(pathname);
  if (match?.[1]) {
    try {
      const nodeId = new URLSearchParams(search).get("node");
      return {
        name: "editor",
        graphId: decodeURIComponent(match[1]),
        ...(nodeId ? { nodeId } : {}),
      };
    } catch {
      return { name: "notFound", path: pathname };
    }
  }
  return { name: "notFound", path: pathname };
}

function pathFor(route: AppRoute): string {
  if (route.name === "editor") {
    const base = `/g/${encodeURIComponent(route.graphId)}`;
    return route.nodeId ? `${base}?node=${encodeURIComponent(route.nodeId)}` : base;
  }
  if (route.name === "terms") return "/terms";
  if (route.name === "privacy") return "/privacy";
  if (route.name === "tokens") return "/integrations";
  if (route.name === "notFound") return route.path;
  return "/";
}

export function navigate(route: AppRoute, mode: "push" | "replace" = "push"): void {
  const path = pathFor(route);
  if (path === `${window.location.pathname}${window.location.search}`) return;
  if (mode === "replace") {
    window.history.replaceState(null, "", path);
  } else {
    window.history.pushState(null, "", path);
  }
}

const APP_NAME = "graphnote";

/** Browser tab title per screen; the editor passes the note's title. */
export function documentTitle(screen: string, detail?: string | null): string {
  const page =
    screen === "editor"
      ? detail?.trim() || "ノート"
      : screen === "list"
        ? "あなたのノート"
        : screen === "tokens"
          ? "CLI連携"
          : screen === "terms"
            ? "利用規約"
            : screen === "privacy"
              ? "プライバシーポリシー"
              : screen === "login"
                ? "ログイン"
                : screen === "notFound"
                  ? "ページが見つかりません"
                  : null;
  return page ? `${page} · ${APP_NAME}` : APP_NAME;
}
