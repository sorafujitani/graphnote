export type AppRoute = { name: "list" } | { name: "editor"; graphId: string };

/** `/g/<graphId>` opens the editor; everything else is the notes list. */
export function parseRoute(pathname: string): AppRoute {
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
