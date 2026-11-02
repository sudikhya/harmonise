/** Server-only cookie session lookup shared by authenticated routes. */

import type { NextRequest } from "next/server";
import { deleteExpiredSessions, deleteSession, findPublicUserById, findSession, type PublicUser } from "@/lib/connect/db";
import { SESSION_COOKIE, hashToken } from "@/lib/connect/auth";

export async function requestUser(request: NextRequest): Promise<PublicUser | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await findSession(hashToken(token));
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    await deleteSession(hashToken(token));
    await deleteExpiredSessions(Date.now());
    return null;
  }
  return findPublicUserById(session.userId);
}
