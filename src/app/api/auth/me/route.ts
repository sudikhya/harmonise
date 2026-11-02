import { NextResponse, type NextRequest } from "next/server";
import { requestUser } from "@/lib/connect/session-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await requestUser(request);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  return NextResponse.json(user);
}
