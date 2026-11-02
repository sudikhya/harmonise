import { NextResponse } from "next/server";
import { COMMUNITY_IDS, detectCrisis, leaksCommunityReference } from "@/lib/connect/catalog";
import {
  MAX_HISTORY_TURNS,
  MAX_MESSAGE_LENGTH,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
  cleanHistory,
  type AdviceResult,
} from "@/lib/connect/advice";
import { chatJson, providerConfig, providerKeyName } from "@/lib/connect/llm";

export const runtime = "nodejs";

const MAX_REFLECTION = 600;
const MAX_STEP = 350;
const MAX_PERSPECTIVE = 450;
const MAX_REASON = 300;
const MAX_MATCHES = 2;
const LLM_TIMEOUT_MS = 25_000;

/** Lightweight in-memory rate limit (per server instance). */
const requestLog = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const recent = (requestLog.get(key) ?? []).filter((time) => time > cutoff);
  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    requestLog.set(key, recent);
    return true;
  }
  recent.push(now);
  requestLog.set(key, recent);
  if (requestLog.size > 5000) requestLog.clear();
  return false;
}

function unavailable(status = 503) {
  return NextResponse.json({ error: "unavailable" }, { status });
}

function validAdvice(value: unknown): AdviceResult | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.reflection !== "string" || record.reflection.trim().length === 0) return null;
  if (typeof record.perspective !== "string" || record.perspective.trim().length === 0) return null;
  if (!Array.isArray(record.steps) || record.steps.length < 2 || record.steps.length > 4) return null;
  if (!Array.isArray(record.matches)) return null;
  const reflection = record.reflection.trim().slice(0, MAX_REFLECTION);
  const perspective = record.perspective.trim().slice(0, MAX_PERSPECTIVE);
  const steps: string[] = [];
  for (const step of record.steps) {
    if (typeof step !== "string" || step.trim().length === 0) return null;
    steps.push(step.trim().slice(0, MAX_STEP));
  }
  const seen = new Set<string>();
  const matches: AdviceResult["matches"] = [];
  for (const item of record.matches) {
    if (matches.length >= MAX_MATCHES) break;
    if (typeof item !== "object" || item === null) return null;
    const entry = item as Record<string, unknown>;
    if (typeof entry.id !== "string" || typeof entry.reason !== "string") return null;
    if (!COMMUNITY_IDS.includes(entry.id as (typeof COMMUNITY_IDS)[number])) return null;
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    matches.push({ id: entry.id, reason: entry.reason.trim().slice(0, MAX_REASON) });
  }
  // Fail closed: visible guidance must never name or hint at matching.
  for (const text of [reflection, perspective, ...steps]) {
    if (leaksCommunityReference(text)) return null;
  }
  return { reflection, steps, perspective, matches };
}

const SYSTEM_PROMPT = [
  "You are Harmonise Adviser, a calm peer-support guide. You listen, reflect, and offer practical next steps.",
  "You are not a therapist, doctor, lawyer, or emergency service. Never diagnose, never give legal verdicts, never predict outcomes.",
  "Rules for the visible fields (reflection, steps, perspective):",
  "- Never mention communities, matching, groups, circles, or other people the user could meet.",
  "- Never promise outcomes or claim certainty.",
  "Rules for matches: pick 0 to 2 community IDs only when the user's words clearly fit. Prefer no match over a weak one.",
  "- rebuilding: separation, divorce, breakup, co-parenting, identity change, starting over.",
  "- legal-clarity: preparing questions and decisions before speaking with a qualified legal professional.",
  "- steady-ground: uncertainty, grief, loneliness, family pressure, anxiety, disrupted routines.",
  "Keep the reflection to 1-2 sentences, each step to one sentence, the perspective to 1-2 sentences.",
].join(" ");

const RESPONSE_SCHEMA = {
  name: "harmonise_advice",
  strict: true,
  schema: {
    type: "object",
    properties: {
      reflection: { type: "string", description: "Short empathetic reflection of what the user shared." },
      steps: {
        type: "array",
        description: "Two to four practical next steps.",
        items: { type: "string" },
        minItems: 2,
        maxItems: 4,
      },
      perspective: { type: "string", description: "Short reassuring perspective." },
      matches: {
        type: "array",
        description: "Hidden community matches, revealed only after explicit consent.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", enum: [...COMMUNITY_IDS] },
            reason: { type: "string", description: "Short reason this community may fit." },
          },
          required: ["id", "reason"],
          additionalProperties: false,
        },
        maxItems: MAX_MATCHES,
      },
    },
    required: ["reflection", "steps", "perspective", "matches"],
    additionalProperties: false,
  },
} as const;

export async function POST(request: Request) {
  const clientKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(clientKey)) {
    return NextResponse.json({ error: "rate-limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const record = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (typeof record.message !== "string") return NextResponse.json({ error: "invalid" }, { status: 400 });
  const message = record.message.trim();
  if (message.length === 0 || message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  // Deterministic safety screen before any model call.
  if (detectCrisis(message)) {
    return NextResponse.json({ crisis: true });
  }

  const config = providerConfig();
  if (!config) {
    console.warn(`advice: ${providerKeyName()} missing`);
    return unavailable();
  }

  const history = cleanHistory(record.history).slice(-MAX_HISTORY_TURNS);
  const started = Date.now();
  // Strict JSON schema is OpenAI-only; other OpenAI-compatible providers get
  // plain JSON mode plus an explicit instruction. Server-side validAdvice
  // still validates everything and fails closed either way.
  const parsed = await chatJson(
    config,
    [
      {
        role: "system",
        content: config.strictJsonSchema
          ? SYSTEM_PROMPT
          : `${SYSTEM_PROMPT} Reply with a single valid JSON object and nothing else.`,
      },
      ...history.map((turn) => ({
        role: (turn.role === "user" ? "user" : "assistant") as "user" | "assistant",
        content: turn.text,
      })),
      { role: "user" as const, content: message },
    ],
    { timeoutMs: LLM_TIMEOUT_MS, jsonSchema: RESPONSE_SCHEMA },
  );
  if (parsed === null) {
    console.warn(`advice: model unavailable after ${Date.now() - started}ms`);
    return unavailable(502);
  }
  const advice = validAdvice(parsed);
  if (!advice) {
    console.warn("advice: model output failed validation");
    return unavailable(502);
  }
  return NextResponse.json(advice);
}
