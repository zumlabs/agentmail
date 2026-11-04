import { timingSafeEqual, toHex } from "./lib/crypto";
import type { Env } from "./types";

export const SESSION_COOKIE = "agentmail_admin";
export const SESSION_TTL_MS = 7 * 24 * 3_600_000;

const encoder = new TextEncoder();

async function hmacKey(pepper: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(`admin-session|${pepper}`), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

async function sign(payload: string, pepper: string): Promise<string> {
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(pepper), encoder.encode(payload));
  return toHex(new Uint8Array(signature));
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

/** Signed, expiring cookie value: `v1.<expiresMs>.<hmac>`. */
export async function issueSession(env: Env, secure: boolean): Promise<string> {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `v1.${expires}`;
  const value = `${payload}.${await sign(payload, env.TOKEN_PEPPER)}`;
  const attributes = [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

export async function verifySession(env: Env, value: string | null): Promise<boolean> {
  if (!value) return false;
  const [version, expires, signature] = value.split(".");
  if (version !== "v1" || !expires || !signature) return false;
  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  return timingSafeEqual(await sign(`v1.${expires}`, env.TOKEN_PEPPER), signature);
}

export function clearSession(secure: boolean): string {
  const attributes = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0"];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

export function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === "https:";
}
