import { NextResponse, type NextRequest } from "next/server";
import { deleteSession } from "@/lib/connect/db";
import { SESSION_COOKIE, hashToken } from "@/lib/connect/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(hashToken(token));
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
