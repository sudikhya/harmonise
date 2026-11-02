import { NextResponse } from "next/server";
import { createSession, createUser } from "@/lib/connect/db";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  hashPassword,
  hashToken,
  newSessionToken,
  validEmail,
} from "@/lib/connect/auth";
import { isRateLimited } from "@/lib/connect/rate-limit";

export const runtime = "nodejs";

const MAX_NAME_LENGTH = 40;
const MAX_EMAIL_LENGTH = 120;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

export async function POST(request: Request) {
  const clientKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(`auth-signup:${clientKey}`, 30, 60_000)) {
    return NextResponse.json({ error: "rate-limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const record = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
  const password = typeof record.password === "string" ? record.password : "";
  if (
    name.length === 0 ||
    name.length > MAX_NAME_LENGTH ||
    email.length > MAX_EMAIL_LENGTH ||
    !validEmail(email) ||
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const seeded = await hashPassword(password);
  const user = await createUser(name, email, seeded.salt, seeded.hash);
  if (!user) {
    return NextResponse.json({ error: "taken" }, { status: 409 });
  }

  const token = newSessionToken();
  await createSession(user.id, hashToken(token), Date.now() + SESSION_TTL_MS);
  const response = NextResponse.json(user, { status: 201 });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
