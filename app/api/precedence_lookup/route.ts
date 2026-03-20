import { NextRequest, NextResponse } from "next/server";
import type { HistoricalAward, HistoricalPrecedent, NodeResult, Reasoning } from "@/lib/request-data";
import { getHistoricalAwardsByContext, getHistoricalAwardsByRequestIds } from "@/lib/db";

const MAX_PRECEDENTS = 5;

/** Normalised proximity score for a single numeric dimension. Lower = closer. */
function numericDistance(a: number, b: number): number {
  const denom = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / denom;
}

/** Date proximity: absolute day difference, normalised to 0–1 over a 365-day window. */
function dateDistance(a: string, b: string): number {
  const days = Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
  return Math.min(days / 365, 1);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as Record<string, unknown>;

  const category_l1      = (body["category_l1"]      ?? "") as string;
  const category_l2      = (body["category_l2"]      ?? "") as string;
  const currency         = (body["currency"]          ?? "") as string;
  const country          = (body["country"]           ?? "") as string;
  const budget_amount    = typeof body["budget_amount"]  === "number" ? body["budget_amount"]  : null;
  const quantity         = typeof body["quantity"]       === "number" ? body["quantity"]       : null;
  const required_by_date = (body["required_by_date"]  ?? "") as string;

  console.log(`[precedence_lookup] cat=(${category_l1}/${category_l2}) currency=${currency} country=${country}`);

  const reasonings: Reasoning[] = [];

  // ── 1. Exact-match query ────────────────────────────────────────────────────
  let candidates: HistoricalAward[] = [];
  try {
    candidates = await getHistoricalAwardsByContext(category_l1, category_l2, currency, country);
  } catch (e) {
    console.error("[precedence_lookup] DB query failed:", e);
    reasonings.push({
      step_id: "R-PL-001",
      aspect: "Historical Precedent Lookup",
      reasoning: "Database query failed. No historical precedents could be retrieved.",
    });
    const result: NodeResult & { historical_precedents: HistoricalPrecedent[] } = {
      issues: [], escalations: [], reasonings, policy_violations: [], historical_precedents: [],
    };
    return NextResponse.json(result);
  }

  console.log(`[precedence_lookup] ${candidates.length} candidate row(s) after exact-match filter`);

  // ── 2. Score candidates by proximity and pick top N unique request IDs ──────
  type Scored = { request_id: string; score: number };
  const scoreByRequestId = new Map<string, number>();

  for (const row of candidates) {
    if (!row.request_id) continue;

    let score = 0;
    let dimensions = 0;

    if (budget_amount !== null && row.total_value !== null) {
      score += numericDistance(budget_amount, row.total_value);
      dimensions++;
    }
    if (quantity !== null && row.quantity !== null) {
      score += numericDistance(quantity, row.quantity);
      dimensions++;
    }
    if (required_by_date && row.required_by_date) {
      score += dateDistance(required_by_date, row.required_by_date);
      dimensions++;
    }

    const normalised = dimensions > 0 ? score / dimensions : 0;

    // Keep best (lowest) score per request_id
    const prev = scoreByRequestId.get(row.request_id);
    if (prev === undefined || normalised < prev) {
      scoreByRequestId.set(row.request_id, normalised);
    }
  }

  const topRequestIds: string[] = [...scoreByRequestId.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, MAX_PRECEDENTS)
    .map(([id]) => id);

  console.log(`[precedence_lookup] top request IDs: ${topRequestIds.join(", ") || "(none)"}`);

  // ── 3. Fetch all rows for selected request IDs ──────────────────────────────
  let allRows: HistoricalAward[] = [];
  if (topRequestIds.length > 0) {
    try {
      allRows = await getHistoricalAwardsByRequestIds(topRequestIds);
    } catch (e) {
      console.error("[precedence_lookup] second DB query failed:", e);
    }
  }

  // ── 4. Group by request_id ──────────────────────────────────────────────────
  const grouped = new Map<string, HistoricalAward[]>();
  for (const row of allRows) {
    const rid = row.request_id ?? "unknown";
    if (!grouped.has(rid)) grouped.set(rid, []);
    grouped.get(rid)!.push(row);
  }

  const historical_precedents: HistoricalPrecedent[] = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([request_id, awards]) => ({ request_id, awards }));

  // ── 5. Build reasoning ──────────────────────────────────────────────────────
  const winners: string[] = historical_precedents.flatMap(({ awards }) =>
    awards
      .filter((a) => a.awarded === true && a.supplier_name)
      .map((a) => `${a.supplier_name} (${a.request_id})`)
  );

  const winnerSummary = winners.length > 0
    ? `Awarded suppliers: ${winners.join("; ")}.`
    : "No awarded supplier records found among these precedents.";

  reasonings.push({
    step_id: "R-PL-001",
    aspect: "Historical Precedent Lookup",
    reasoning:
      candidates.length === 0
        ? `No historical awards found matching category (${category_l1} / ${category_l2}), currency ${currency}, country ${country}. No precedents available.`
        : `Found ${candidates.length} candidate row(s) across ${scoreByRequestId.size} unique request(s) matching category, currency, and country. ` +
          `Selected ${historical_precedents.length} closest precedent(s) by proximity of value, quantity, and required date: [${topRequestIds.join(", ")}]. ` +
          winnerSummary,
  });

  console.log(`[precedence_lookup] ${historical_precedents.length} precedent(s) stored`);

  const result: NodeResult & { historical_precedents: HistoricalPrecedent[] } = {
    issues: [], escalations: [], reasonings, policy_violations: [], historical_precedents,
  };
  return NextResponse.json(result);
}
