import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { Bindings } from "./env";

const COOKIE_NAME = "gn_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function bytesToBase64Url(bytes: ArrayBuffer | Uint8Array): string {
	const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	const bin = String.fromCharCode(...view);
	return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function textToBase64Url(text: string): string {
	return bytesToBase64Url(new TextEncoder().encode(text));
}

function base64UrlToText(value: string): string {
	const padded = value.replace(/-/g, "+").replace(/_/g, "/");
	const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
	return atob(padded + pad);
}

async function hmacSign(secret: string, payload: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(payload),
	);
	return bytesToBase64Url(sig);
}

export async function createSessionToken(secret: string): Promise<string> {
	const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
	const payload = textToBase64Url(JSON.stringify({ exp }));
	const sig = await hmacSign(secret, payload);
	return `${payload}.${sig}`;
}

export async function verifySessionToken(
	secret: string,
	token: string,
): Promise<boolean> {
	const [payload, sig] = token.split(".");
	if (!payload || !sig) return false;
	const expected = await hmacSign(secret, payload);
	if (sig !== expected) return false;
	try {
		const data = JSON.parse(base64UrlToText(payload)) as { exp?: number };
		if (typeof data.exp !== "number") return false;
		return data.exp > Math.floor(Date.now() / 1000);
	} catch {
		return false;
	}
}

export function setSessionCookie(
	c: Context<{ Bindings: Bindings }>,
	token: string,
) {
	const secure = new URL(c.req.url).protocol === "https:";
	setCookie(c, COOKIE_NAME, token, {
		httpOnly: true,
		secure,
		sameSite: "Lax",
		path: "/",
		maxAge: SESSION_TTL_SECONDS,
	});
}

export function clearSessionCookie(c: Context<{ Bindings: Bindings }>) {
	deleteCookie(c, COOKIE_NAME, { path: "/" });
}

export const requireAuth = createMiddleware<{ Bindings: Bindings }>(
	async (c, next) => {
		const token = getCookie(c, COOKIE_NAME);
		if (!token || !(await verifySessionToken(c.env.SESSION_SECRET, token))) {
			return c.json({ error: "unauthorized" }, 401);
		}
		await next();
	},
);
