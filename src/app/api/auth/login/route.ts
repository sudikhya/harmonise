import { NextResponse } from "next/server";
import { createSession, deleteExpiredSessions, findUserByEmail } from "@/lib/connect/db";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  dummyVerify,
  hashToken,
  newSessionToken,
  verifyPassword,
} from "@/lib/connect/auth";
import { isRateLimited } from "@/lib/connect/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const clientKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(`auth-login:${clientKey}`, 30, 60_000)) {
    return NextResponse.json({ error: "rate-limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const record = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
  const password = typeof record.password === "string" ? record.password : "";
  if (email.length === 0 || password.length === 0) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const user = await findUserByEmail(email);
  // Same generic response either way so unknown emails are not enumerable.
  const ok = user ? await verifyPassword(password, user.pass_salt, user.pass_hash) : false;
  if (!user) await dummyVerify();
  if (!user || !ok) {
    return NextResponse.json({ error: "invalid-credentials" }, { status: 401 });
  }

  const token = newSessionToken();
  await createSession(user.id, hashToken(token), Date.now() + SESSION_TTL_MS);
  await deleteExpiredSessions(Date.now());
  const response = NextResponse.json({ id: user.id, name: user.name, email: user.email });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
