/**
 * Specialist-agent logic for the Harmonise connect experience.
 * Pure deterministic functions, imported by both client components and
 * server routes/workers, so the safety, monitoring, and discovery agents
 * work with or without a configured model.
 */
import { detectCrisis } from "@/lib/connect/catalog";

/* ---------------- Safety / spam agent ---------------- */

export type SafetyFlag = { type: "spam" | "link" | "contact" | "crisis" | "unkind"; label: string; detail: string };
export type SafetyVerdict = { ok: boolean; flags: SafetyFlag[] };

const SPAM_WORDS = /buy now|cheap|discount|free money|click here|act now|limited offer|double your money|wire transfer|gift card|crypto|investment/i;
const LINK = /https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|io|app|co|in|me|link)\b/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE = /\+?\d[\d\s().-]{7,}\d/;
const REPEAT_CHAR = /(.)\1{5,}/;
const UNKIND = /\b(kill yourself|kys\b|you are worthless|i will hurt you|i will kill you)\b/i;

export function scanSafety(text: string): SafetyVerdict {
  const flags: SafetyFlag[] = [];
  if (detectCrisis(text)) {
    flags.push({
      type: "crisis",
      label: "Urgent-support resources shown",
      detail: "This message suggests someone may be unsafe. Urgent support opens instead of advice.",
    });
    return { ok: false, flags };
  }
  if (LINK.test(text)) {
    flags.push({ type: "link", label: "Link detected", detail: "Links are never shared with circles automatically." });
  }
  if (EMAIL.test(text) || PHONE.test(text)) {
    flags.push({
      type: "contact",
      label: "Contact details detected",
      detail: "Keep phone numbers and emails private; circles never need them.",
    });
  }
  const letters = text.replace(/[^a-zA-Z]/g, "");
  const capsRatio = letters.length > 0 ? text.replace(/[^A-Z]/g, "").length / letters.length : 0;
  if (SPAM_WORDS.test(text) || REPEAT_CHAR.test(text) || (text.length > 24 && capsRatio > 0.7)) {
    flags.push({
      type: "spam",
      label: "Possible spam",
      detail: "This reads like spam or a scam. It stays private and is flagged for human review.",
    });
  }
  if (UNKIND.test(text)) {
    flags.push({
      type: "unkind",
      label: "Unkind content",
      detail: "Threatening language is flagged for human review.",
    });
  }
  return { ok: flags.length === 0, flags };
}

/* ---------------- Discovery agent: theme mining ---------------- */

export type ThemeId =
  | "job-loss"
  | "grief"
  | "caregiving"
  | "new-city"
  | "new-parent"
  | "chronic-health"
  | "money-stress"
  | "sleep";

export type ThemeCluster = {
  id: ThemeId;
  label: string;
  proposalName: string;
  proposalDescription: string;
  patterns: RegExp[];
};

export const THEME_CLUSTERS: ThemeCluster[] = [
  {
    id: "job-loss",
    label: "Job loss",
    proposalName: "Between jobs",
    proposalDescription: "For layoffs, job hunting, and money pressure while work is uncertain.",
    patterns: [/laid off/i, /lost my job/i, /unemploy/i, /\bfired\b/i, /redundan/i, /job hunt/i, /\bjobless\b/i],
  },
  {
    id: "grief",
    label: "Grief",
    proposalName: "Carrying grief",
    proposalDescription: "For loss, funerals, and the slow work of mourning.",
    patterns: [/grief/i, /griev/i, /passed away/i, /\blost (my|him|her|them)\b/i, /funeral/i, /mourning/i, /bereave/i],
  },
  {
    id: "caregiving",
    label: "Caregiving",
    proposalName: "Caring for parents",
    proposalDescription: "For members supporting aging or ill parents and family.",
    patterns: [/caregiver/i, /caring for/i, /aging (mom|dad|mother|father|parent)/i, /ill (mom|dad|mother|father|parent)/i],
  },
  {
    id: "new-city",
    label: "New city",
    proposalName: "New city, new start",
    proposalDescription: "For moves, relocation, homesickness, and starting over somewhere new.",
    patterns: [/\bmoved\b/i, /relocat/i, /new city/i, /new country/i, /homesick/i, /just arrived/i],
  },
  {
    id: "new-parent",
    label: "New parent",
    proposalName: "New parents, little sleep",
    proposalDescription: "For new mums, dads, and parents finding their footing.",
    patterns: [/new (mom|dad|mum|parent)/i, /\bbaby\b/i, /postpartum/i, /toddler/i, /pregnan/i],
  },
  {
    id: "chronic-health",
    label: "Health",
    proposalName: "Living with health stuff",
    proposalDescription: "For diagnoses, treatment, hospital visits, and chronic pain.",
    patterns: [/chronic/i, /diagnos/i, /treatment/i, /hospital/i, /surgery/i, /chronic pain/i, /doctor said/i],
  },
  {
    id: "money-stress",
    label: "Money stress",
    proposalName: "Money pressure, calmly",
    proposalDescription: "For debt, rent, bills, and money worry — practical and peer-led.",
    patterns: [/\bdebt\b/i, /\brent\b/i, /\bbills\b/i, /money (is|’s|pressure|worry|tight)/i, /can't afford/i, /cannot afford/i, /paycheck/i],
  },
  {
    id: "sleep",
    label: "Sleep",
    proposalName: "Restless nights",
    proposalDescription: "For insomnia, nightmares, exhaustion, and rebuilding rest.",
    patterns: [/\bsleep\b/i, /insomnia/i, /nightmare/i, /can't sleep/i, /cannot sleep/i, /exhaust/i, /up all night/i],
  },
];

/** Themes detected in one message. */
export function extractSignals(text: string): ThemeId[] {
  return THEME_CLUSTERS.filter((cluster) => cluster.patterns.some((pattern) => pattern.test(text))).map(
    (cluster) => cluster.id,
  );
}

export type CircleProposal = {
  theme: ThemeId;
  label: string;
  name: string;
  description: string;
  strength: number;
};

/** Proposals surface after a theme appears across at least two messages. */
export function proposeFromSignals(counts: Record<string, number>): CircleProposal[] {
  return THEME_CLUSTERS.filter((cluster) => (counts[cluster.id] ?? 0) >= 2)
    .map((cluster) => ({
      theme: cluster.id,
      label: cluster.label,
      name: cluster.proposalName,
      description: cluster.proposalDescription,
      strength: counts[cluster.id] ?? 0,
    }))
    .sort((a, b) => b.strength - a.strength);
}

/* ---------------- Live radar: emerging communities (sample) ---------------- */

export type EmergingCircle = { id: string; name: string; description: string; watching: string; momentum: string };

export const EMERGING_SAMPLES: EmergingCircle[] = [
  { id: "em-night-shift", name: "Night-shift workers", description: "Sleep, meals, and quiet hours on flipped schedules.", watching: "42 watching", momentum: "rising fast" },
  { id: "em-first-gen", name: "First-gen navigators", description: "College, careers, and family expectations, first in line.", watching: "38 watching", momentum: "rising" },
  { id: "em-pet-loss", name: "After a pet", description: "Grief for animals who were family.", watching: "35 watching", momentum: "rising" },
  { id: "em-solo-move", name: "Moved alone", description: "First months in a new city without a circle yet.", watching: "31 watching", momentum: "new" },
  { id: "em-chronic-pain", name: "Bad pain days", description: "Low-spoon support for chronic pain flares.", watching: "29 watching", momentum: "rising" },
  { id: "em-new-dads", name: "New dads", description: "Fatherhood's early months, honestly.", watching: "24 watching", momentum: "new" },
  { id: "em-layoff-30s", name: "Laid off in my 30s", description: "Identity and income after a mid-career layoff.", watching: "22 watching", momentum: "new" },
  { id: "em-caregiver-night", name: "Caregiver nights", description: "Late shifts caring for parents, together.", watching: "19 watching", momentum: "new" },
];

/* ---------------- Monitor agent ---------------- */

export type CircleHealth = "steady" | "attention";

export function circleHealth(flagCount: number): CircleHealth {
  return flagCount > 0 ? "attention" : "steady";
}
