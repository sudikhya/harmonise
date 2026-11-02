import { NextResponse, type NextRequest } from "next/server";
import { deleteExpiredSessions, deleteSession, findPublicUserById, findSession } from "@/lib/connect/db";
import { SESSION_COOKIE, hashToken } from "@/lib/connect/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const session = await findSession(hashToken(token));
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (session.expiresAt <= Date.now()) {
    await deleteSession(hashToken(token));
    await deleteExpiredSessions(Date.now());
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const user = await findPublicUserById(session.userId);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  return NextResponse.json(user);
}
