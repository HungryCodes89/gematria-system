// Uses Web Crypto API (globalThis.crypto.subtle) so it works in both
// Next.js Edge Runtime (middleware) and Node.js (API routes).

const COOKIE_NAME = "gematria-session";
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours in ms

function getSecret(): string {
  return process.env.APP_PASSWORD || "changeme";
}

// HMAC-SHA256 via Web Crypto — works in Edge Runtime and Node.js 18+
async function hmacSign(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// base64url helpers — no Buffer dependency, works in Edge Runtime
function b64urlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function b64urlDecode(str: string): string {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  return atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

export function verifyPassword(password: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  return password === expected;
}

export async function createSessionToken(): Promise<string> {
  const payload = b64urlEncode(JSON.stringify({ exp: Date.now() + SESSION_TTL }));
  const sig = await hmacSign(payload);
  return `${payload}.${sig}`;
}

export async function verifySessionToken(token: string): Promise<boolean> {
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx === -1) return false;
  const payload = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  if (!payload || !sig) return false;

  const expected = await hmacSign(payload);
  if (sig !== expected) return false;

  try {
    const data = JSON.parse(b64urlDecode(payload));
    if (typeof data.exp !== "number" || data.exp < Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

export function sessionCookieOptions(isProduction: boolean) {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL / 1000,
  };
}

export { COOKIE_NAME };
