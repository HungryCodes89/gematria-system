import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export async function POST(request: NextRequest) {
  const { password } = await request.json();
  const appPassword = process.env.APP_PASSWORD;

  if (!appPassword) {
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500 }
    );
  }

  if (password !== appPassword) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const exp = Math.floor(Date.now() / 1000) + 86400;
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64");
  const signature = sign(payload, appPassword);
  const token = `${payload}.${signature}`;

  const isProduction = process.env.NODE_ENV === "production";

  const res = NextResponse.json({ success: true });
  res.cookies.set("gematria-session", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 86400,
  });

  return res;
}
