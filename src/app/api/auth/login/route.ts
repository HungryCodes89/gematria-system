import { NextRequest, NextResponse } from "next/server";
import {
  verifyPassword,
  createSessionToken,
  sessionCookieOptions,
  COOKIE_NAME,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { password } = await request.json();

  if (!process.env.APP_PASSWORD) {
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500 }
    );
  }

  if (!verifyPassword(password)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = await createSessionToken();
  const isProduction = process.env.NODE_ENV === "production";

  const res = NextResponse.json({ success: true });
  res.cookies.set(COOKIE_NAME, token, sessionCookieOptions(isProduction));

  return res;
}
