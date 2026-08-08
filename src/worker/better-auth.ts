import { betterAuth } from "better-auth";
import type { Bindings } from "./env";

/**
 * Better Auth keeps the OAuth state row for 10 minutes but defaults the paired
 * state cookie to 5, so a slow Google screen (account chooser, 2FA, first-time
 * consent) came back with a valid state and no cookie — `state_mismatch`.
 */
const OAUTH_STATE_TTL_SEC = 600;

export function createAuth(env: Bindings) {
  return betterAuth({
    database: env.DB,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    // Failed sign-ins land on our login screen with `?error=<code>` instead of
    // Better Auth's built-in English error page.
    onAPIError: { errorURL: "/" },
    advanced: {
      cookies: { state: { attributes: { maxAge: OAUTH_STATE_TTL_SEC } } },
      defaultCookieAttributes: {
        sameSite: "lax",
        secure: env.BETTER_AUTH_URL.startsWith("https://"),
        httpOnly: true,
        path: "/",
      },
    },
  });
}
