export type AppRoute =
  | { name: "list" }
  | { name: "editor"; graphId: string }
  | { name: "terms" }
  | { name: "privacy" }
  | { name: "tokens" };

/** Path → screen. Legal pages are public; editor/list require auth at App level. */
export function parseRoute(pathname: string): AppRoute {
  if (pathname === "/terms" || pathname === "/terms/") return { name: "terms" };
  if (pathname === "/privacy" || pathname === "/privacy/") return { name: "privacy" };
  if (pathname === "/integrations" || pathname === "/integrations/") return { name: "tokens" };
  if (pathname === "/tokens" || pathname === "/tokens/") return { name: "tokens" };
  const match = /^\/g\/([^/]+)\/?$/.exec(pathname);
  if (!match?.[1]) return { name: "list" };
  try {
    return { name: "editor", graphId: decodeURIComponent(match[1]) };
  } catch {
    return { name: "list" };
  }
}

function pathFor(route: AppRoute): string {
  if (route.name === "editor") return `/g/${encodeURIComponent(route.graphId)}`;
  if (route.name === "terms") return "/terms";
  if (route.name === "privacy") return "/privacy";
  if (route.name === "tokens") return "/integrations";
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
