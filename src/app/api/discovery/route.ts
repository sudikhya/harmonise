import { NextResponse } from "next/server";
import { approvedProposals } from "@/lib/connect/db";
import { ensureWorkers } from "@/lib/connect/workers";

export const runtime = "nodejs";

function momentumFor(strength: number): string {
  if (strength >= 6) return "rising fast";
  if (strength >= 4) return "rising";
  return "new";
}

export async function GET() {
  ensureWorkers();
  const proposals = await approvedProposals();
  return NextResponse.json({
    emerging: proposals.map((proposal) => ({
      id: `em-${proposal.theme}`,
      name: proposal.name,
      description: proposal.description,
      watching: `${12 + proposal.strength * 3} watching`,
      momentum: momentumFor(proposal.strength),
    })),
  });
}
