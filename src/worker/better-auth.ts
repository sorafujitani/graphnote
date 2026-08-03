import { betterAuth } from "better-auth";
import type { Bindings } from "./env";

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
    advanced: {
      defaultCookieAttributes: {
        sameSite: "lax",
        secure: env.BETTER_AUTH_URL.startsWith("https://"),
        httpOnly: true,
        path: "/",
      },
    },
  });
}
