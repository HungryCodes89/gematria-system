import crypto from "crypto";

const COOKIE_NAME = "gematria-session";
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getSecret(): string {
  return process.env.APP_PASSWORD || "changeme";
}

function sign(payload: string): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("hex");
}

export function verifyPassword(password: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  return password === expected;
}

export function createSessionToken(): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + SESSION_TTL })
  ).toString("base64url");
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string): boolean {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = sign(payload);
  if (sig !== expected) return false;
  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString()
    );
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
