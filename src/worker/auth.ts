import { createMiddleware } from "hono/factory";
import type { ApiTokenScope, PublicUser } from "../shared/types";
import { createAuth } from "./better-auth";
import type { Bindings } from "./env";
import { resolveApiToken } from "./tokens";

export type AuthMethod = "session" | "token";

export type AuthVariables = {
  userId: string;
  user: PublicUser | null;
  authMethod: AuthMethod;
  tokenId: string | null;
  tokenScopes: ApiTokenScope[];
};

function toPublicUser(user: {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image ?? null,
  };
}

async function resolveUserId(
  env: Bindings,
  request: Request,
): Promise<{
  userId: string;
  user: PublicUser | null;
  authMethod: AuthMethod;
  tokenId: string | null;
  tokenScopes: ApiTokenScope[];
} | null> {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    const principal = await resolveApiToken(env.DB, token);
    if (principal) {
      return {
        userId: principal.userId,
        user: null,
        authMethod: "token",
        tokenId: principal.tokenId,
        tokenScopes: principal.scopes,
      };
    }
  }

  const auth = createAuth(env);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  return {
    userId: session.user.id,
    user: toPublicUser(session.user),
    authMethod: "session",
    tokenId: null,
    tokenScopes: [],
  };
}

export const requireUser = createMiddleware<{
  Bindings: Bindings;
  Variables: AuthVariables;
}>(async (c, next) => {
  const resolved = await resolveUserId(c.env, c.req.raw);
  if (!resolved) {
    return c.json({ error: "unauthorized" }, 401);
  }
  c.set("userId", resolved.userId);
  c.set("user", resolved.user);
  c.set("authMethod", resolved.authMethod);
  c.set("tokenId", resolved.tokenId);
  c.set("tokenScopes", resolved.tokenScopes);
  await next();
});

export const requireSession = createMiddleware<{
  Bindings: Bindings;
  Variables: AuthVariables;
}>(async (c, next) => {
  if (c.get("authMethod") !== "session") {
    return c.json({ error: "browser session required" }, 403);
  }
  await next();
});

export function requireScope(scope: ApiTokenScope) {
  return createMiddleware<{ Bindings: Bindings; Variables: AuthVariables }>(async (c, next) => {
    if (c.get("authMethod") === "token" && !c.get("tokenScopes").includes(scope)) {
      return c.json({ error: `token scope required: ${scope}` }, 403);
    }
    await next();
  });
}

export const requireToken = createMiddleware<{
  Bindings: Bindings;
  Variables: AuthVariables;
}>(async (c, next) => {
  if (c.get("authMethod") !== "token" || !c.get("tokenId")) {
    return c.json({ error: "API token required" }, 403);
  }
  await next();
});
