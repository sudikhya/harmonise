import { NextResponse, type NextRequest } from "next/server";
import { COMMUNITY_IDS } from "@/lib/connect/catalog";
import { createPost, listCirclePosts } from "@/lib/connect/db";
import { requestUser } from "@/lib/connect/session-server";
import { ensureWorkers, kickWorkers } from "@/lib/connect/workers";
import { isRateLimited } from "@/lib/connect/rate-limit";

export const runtime = "nodejs";

const MAX_POST_LENGTH = 500;
const FEED_LIMIT = 20;

type CircleParams = { params: Promise<{ id: string }> };

function validCircle(id: string): boolean {
  return (COMMUNITY_IDS as readonly string[]).includes(id);
}

export async function GET(_request: NextRequest, { params }: CircleParams) {
  const { id } = await params;
  if (!validCircle(id)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  ensureWorkers();
  const posts = await listCirclePosts(id, FEED_LIMIT);
  return NextResponse.json({ posts });
}

export async function POST(request: NextRequest, { params }: CircleParams) {
  const { id } = await params;
  if (!validCircle(id)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const clientKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(`circle-post:${clientKey}`, 30, 60_000)) {
    return NextResponse.json({ error: "rate-limited" }, { status: 429 });
  }
  const user = await requestUser(request);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const record = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text.trim() : "";
  if (text.length === 0 || text.length > MAX_POST_LENGTH) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const post = await createPost(id, user.id, user.name, text);
  kickWorkers();
  return NextResponse.json({ post }, { status: 201 });
}
