import { createMiddleware } from "hono/factory";
import type { PublicUser } from "../shared/types";
import { createAuth } from "./better-auth";
import type { Bindings } from "./env";
import { resolveApiTokenUserId } from "./tokens";

export type AuthVariables = {
  userId: string;
  user: PublicUser | null;
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
): Promise<{ userId: string; user: PublicUser | null } | null> {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    const userId = await resolveApiTokenUserId(env.DB, token);
    if (userId) return { userId, user: null };
  }

  const auth = createAuth(env);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  return { userId: session.user.id, user: toPublicUser(session.user) };
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
  await next();
});
