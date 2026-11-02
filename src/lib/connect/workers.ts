/**
 * Background agents. Server-only.
 *
 * Two agents run on a short interval inside the server process (plus an
 * immediate kick after each new circle post):
 *
 * - Discovery mines verified-clean circle posts for recurring themes and
 *   drafts new-community proposals. With a model key it refines the wording;
 *   without one the deterministic drafts still flow.
 * - Verification scans new posts for spam/safety (flagged posts leave the
 *   feeds) and reviews pending proposals before they surface.
 *
 * Nothing here runs on the static export: workers start on first API use.
 */

import { COMMUNITIES } from "@/lib/connect/catalog";
import { extractSignals, proposeFromSignals, scanSafety } from "@/lib/connect/agents";
import {
  approvedProposals,
  markPostScanned,
  pendingProposals,
  refineProposal,
  setProposalStatus,
  unscannedPosts,
  upsertProposal,
  verifiedPostTexts,
} from "@/lib/connect/db";
import { chatJson, providerConfig } from "@/lib/connect/llm";

const TICK_MS = 20_000;
const MAX_POSTS_MINED = 200;
const MAX_UNSCANNED_PER_TICK = 50;
const MAX_NAME_LENGTH = 60;
const MAX_DESCRIPTION_LENGTH = 200;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

function catalogNames(): string[] {
  return Object.values(COMMUNITIES).map((community) => community.name.toLowerCase());
}

function cleanProposalCopy(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length === 0) return null;
  return text.slice(0, max);
}

async function verifyPosts(): Promise<void> {
  const posts = await unscannedPosts(MAX_UNSCANNED_PER_TICK);
  for (const post of posts) {
    const verdict = scanSafety(post.text);
    await markPostScanned(post.id, verdict.ok ? "ok" : "flagged");
  }
}

async function refineWithModel(theme: string, label: string, samples: string[]): Promise<boolean> {
  const config = providerConfig();
  if (!config) return false;
  const pending = (await pendingProposals()).find((proposal) => proposal.theme === theme);
  if (!pending) return false;
  const parsed = await chatJson(
    config,
    [
      {
        role: "system",
        content:
          "You name peer-support communities for Harmonise, a calm human-growth platform. " +
          "Reply with a single valid JSON object {name, description} and nothing else. " +
          "Warm, plain names under 8 words; one-sentence descriptions under 25 words. " +
          "Never clinical, never sensational, never a promise of outcomes.",
      },
      {
        role: "user",
        content: `Theme: ${label}. Member posts:\n${samples.map((sample) => `- ${sample.slice(0, 200)}`).join("\n")}`,
      },
    ],
    { temperature: 0.5, maxTokens: 200, timeoutMs: 20_000 },
  );
  if (typeof parsed !== "object" || parsed === null) return false;
  const record = parsed as Record<string, unknown>;
  const name = cleanProposalCopy(record.name, MAX_NAME_LENGTH);
  const description = cleanProposalCopy(record.description, MAX_DESCRIPTION_LENGTH);
  if (!name || !description || !scanSafety(`${name} ${description}`).ok) return false;
  await refineProposal(pending.id, name, description);
  return true;
}

async function discover(): Promise<void> {
  const texts = await verifiedPostTexts(MAX_POSTS_MINED);
  if (texts.length === 0) return;
  const counts: Record<string, number> = {};
  const samples: Record<string, string[]> = {};
  for (const text of texts) {
    for (const theme of extractSignals(text)) {
      counts[theme] = (counts[theme] ?? 0) + 1;
      if ((samples[theme] ?? []).length < 3) samples[theme] = [...(samples[theme] ?? []), text];
    }
  }
  const already = new Set((await pendingProposals()).map((proposal) => proposal.theme));
  for (const proposal of proposeFromSignals(counts)) {
    const isNew = !already.has(proposal.theme);
    await upsertProposal(proposal.theme, proposal.name, proposal.description, proposal.strength);
    if (isNew) {
      already.add(proposal.theme);
      await refineWithModel(proposal.theme, proposal.label, samples[proposal.theme] ?? []);
    }
  }
}

async function reviewWithModel(name: string, description: string): Promise<boolean | null> {
  const config = providerConfig();
  if (!config) return null;
  const parsed = await chatJson(
    config,
    [
      {
        role: "system",
        content:
          "You review proposed peer-support community names for Harmonise. " +
          "Reply with a single valid JSON object {approve, reason} and nothing else. " +
          "Approve only warm, safe, non-clinical proposals that describe a real shared experience. " +
          "Reject anything sensational, sexual, medical-diagnostic, extremist, or commercially flavored.",
      },
      { role: "user", content: `Name: ${name}\nDescription: ${description}` },
    ],
    { temperature: 0, maxTokens: 150, timeoutMs: 20_000 },
  );
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  return typeof record.approve === "boolean" ? record.approve : null;
}

async function verifyProposals(): Promise<void> {
  const names = catalogNames();
  const approved = (await approvedProposals()).map((proposal) => proposal.name.toLowerCase());
  for (const proposal of await pendingProposals()) {
    const text = `${proposal.name} ${proposal.description}`;
    const duplicate =
      names.includes(proposal.name.toLowerCase()) || approved.includes(proposal.name.toLowerCase());
    if (duplicate || !scanSafety(text).ok) {
      await setProposalStatus(proposal.id, "rejected");
      continue;
    }
    const verdict = await reviewWithModel(proposal.name, proposal.description);
    // No model (or model failure): deterministic checks already passed.
    if (verdict === null || verdict === true) {
      await setProposalStatus(proposal.id, "approved");
    } else {
      await setProposalStatus(proposal.id, "rejected");
    }
  }
}

export async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await verifyPosts();
    await discover();
    await verifyProposals();
  } catch (error) {
    console.warn(`agents: tick failed (${String(error)})`);
  } finally {
    running = false;
  }
}

export function ensureWorkers(): void {
  if (timer) return;
  timer = setInterval(() => {
    void tick();
  }, TICK_MS);
  if (typeof timer.unref === "function") timer.unref();
}

/** Fire-and-forget nudge so new posts surface quickly instead of next tick. */
export function kickWorkers(): void {
  ensureWorkers();
  void tick();
}
