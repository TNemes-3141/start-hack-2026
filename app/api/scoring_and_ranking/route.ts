import { NextRequest, NextResponse } from "next/server";
import type { LeadTimeStatus, NodeResult, Reasoning, RequestData, ScoringBreakdown, ShortlistEntry } from "@/lib/request-data";

// ── Weights ───────────────────────────────────────────────────────────────────

const BASE = { price: 40, quality: 25, risk: 20, esg: 15 };

// When ESG is doubled (15 → 30), the remaining 70 pts are spread across the other
// three components proportionally: scale = 70 / 85.
const ESG_DOUBLED_VALUE = 30;
const NON_ESG_SCALE     = (100 - ESG_DOUBLED_VALUE) / (100 - BASE.esg); // 70/85

function getWeights(esgRequired: boolean) {
  if (!esgRequired) return { ...BASE };
  return {
    price:   BASE.price   * NON_ESG_SCALE,
    quality: BASE.quality * NON_ESG_SCALE,
    risk:    BASE.risk    * NON_ESG_SCALE,
    esg:     ESG_DOUBLED_VALUE,
  };
}

// ── Normalisation helpers ─────────────────────────────────────────────────────

/** Normalise a value to 0–100 (higher value → higher score). */
function normForward(v: number, min: number, max: number): number {
  return max === min ? 100 : ((v - min) / (max - min)) * 100;
}

/** Normalise a value to 0–100 (lower value → higher score). */
function normInverse(v: number, min: number, max: number): number {
  return max === min ? 100 : (1 - (v - min) / (max - min)) * 100;
}

// ── Lead-time helper ─────────────────────────────────────────────────────────

function calcLeadTimeStatus(
  stdDays: number,
  expDays: number,
  daysAvailable: number | null,
): LeadTimeStatus {
  if (daysAvailable === null) return "no_deadline";
  if (stdDays <= daysAvailable) return "standard";
  if (expDays > 0 && expDays <= daysAvailable) return "expedited_only";
  return "cannot_meet";
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const data = await req.json() as RequestData;
  const interp = data.request_interpretation;

  const esgRequired       = interp.esg_requirement          ?? false;
  const dataResidency     = interp.data_residency_constraint ?? false;
  const requiredByDate    = interp.required_by_date          ?? null;
  const currency          = (interp.currency                 ?? "").toUpperCase();
  const preferredRaw      = (interp.preferred_supplier_mentioned ?? "").toLowerCase().trim();

  const reasonings: Reasoning[] = [];
  let step = 1;

  const shortlist = [...data.supplier_shortlist];

  console.log(`[scoring_and_ranking] ${shortlist.length} quote(s), esg_required=${esgRequired}, data_residency=${dataResidency}`);

  if (shortlist.length === 0) {
    reasonings.push({
      step_id:   `R-SR-${String(step++).padStart(3, "0")}`,
      aspect:    "Scoring — No Quotes",
      reasoning: "No supplier quotes available in the shortlist. Scoring skipped.",
    });
    return NextResponse.json({
      issues: [], escalations: [], reasonings, policy_violations: [],
      supplier_shortlist: shortlist,
    } satisfies NodeResult & { supplier_shortlist: ShortlistEntry[] });
  }

  // ── Days until deadline ───────────────────────────────────────────────────
  let daysAvailable: number | null = null;
  if (requiredByDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    daysAvailable = Math.ceil(
      (new Date(requiredByDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
  }

  // ── Weights ───────────────────────────────────────────────────────────────
  const weights = getWeights(esgRequired);

  reasonings.push({
    step_id:   `R-SR-${String(step++).padStart(3, "0")}`,
    aspect:    "Scoring Methodology",
    reasoning: `Weights: Price ${weights.price.toFixed(1)}%, Quality ${weights.quality.toFixed(1)}%, Risk ${weights.risk.toFixed(1)}%, ESG ${weights.esg.toFixed(1)}%${esgRequired ? " — ESG doubled from 15% to 30%, other weights re-normalised proportionally" : ""}. Bonuses: policy-preferred supplier +5 pts, incumbent +2 pts, data-residency compliant +3 pts (when constraint applies). Penalties: expedited-only lead time −3 pts, cannot meet deadline −8 pts.`,
  });

  // ── Compute normalisation bounds across all candidates ───────────────────
  const prices    = shortlist.map((s) => s.total_price);
  const qualities = shortlist.map((s) => s.quality_score ?? 0);
  const risks     = shortlist.map((s) => s.risk_score    ?? 0);
  const esgs      = shortlist.map((s) => s.esg_score     ?? 0);

  const [minPrice, maxPrice] = [Math.min(...prices),    Math.max(...prices)];
  const [minQ,     maxQ    ] = [Math.min(...qualities), Math.max(...qualities)];
  const [minRisk,  maxRisk ] = [Math.min(...risks),     Math.max(...risks)];
  const [minESG,   maxESG  ] = [Math.min(...esgs),      Math.max(...esgs)];

  // ── Score each supplier ───────────────────────────────────────────────────
  const scored: ShortlistEntry[] = shortlist.map((entry) => {
    const price_raw   = normInverse(entry.total_price,        minPrice, maxPrice);
    const quality_raw = normForward(entry.quality_score ?? 0, minQ,     maxQ);
    const risk_raw    = normInverse(entry.risk_score    ?? 0, minRisk,  maxRisk);
    const esg_raw     = normForward(entry.esg_score     ?? 0, minESG,   maxESG);

    const base_score =
      price_raw   * (weights.price   / 100) +
      quality_raw * (weights.quality / 100) +
      risk_raw    * (weights.risk    / 100) +
      esg_raw     * (weights.esg     / 100);

    // Bonuses & penalties
    const preferred_bonus      = entry.preferred_supplier  === true ? 5 : 0;
    const incumbent_bonus      = entry.is_incumbent                  ? 2 : 0;
    const data_residency_bonus = (dataResidency && entry.data_residency_supported === true) ? 3 : 0;

    const lt_status      = calcLeadTimeStatus(entry.standard_lead_time_days, entry.expedited_lead_time_days, daysAvailable);
    const lead_time_penalty = lt_status === "expedited_only" ? -3 : lt_status === "cannot_meet" ? -8 : 0;

    const final_score = base_score + preferred_bonus + incumbent_bonus + data_residency_bonus + lead_time_penalty;

    const breakdown: ScoringBreakdown = {
      price_raw,
      quality_raw,
      risk_raw,
      esg_raw,
      base_score,
      preferred_bonus,
      incumbent_bonus,
      data_residency_bonus,
      lead_time_penalty,
      final_score,
      weights,
      lead_time_status: lt_status,
    };

    return { ...entry, ranking_score: final_score, scoring_breakdown: breakdown };
  });

  // ── Sort descending and assign ranks ─────────────────────────────────────
  scored.sort((a, b) => b.ranking_score - a.ranking_score);
  const ranked: ShortlistEntry[] = scored.map((entry, i) => ({ ...entry, rank: i + 1 }));

  // ── Per-supplier reasoning ────────────────────────────────────────────────
  for (const entry of ranked) {
    const bd    = entry.scoring_breakdown;
    const flags: string[] = [];

    if (entry.preferred_supplier    === true) flags.push(`policy-preferred (+${bd.preferred_bonus} pts)`);
    if (entry.is_requester_preferred)         flags.push(`requester's preferred supplier`);
    if (entry.preferred_supplier === true && entry.is_requester_preferred)
      flags.push("(policy-preferred and requester-preferred coincide)");
    if (entry.is_incumbent)                   flags.push(`incumbent (+${bd.incumbent_bonus} pts)`);
    if (bd.data_residency_bonus > 0)          flags.push(`data-residency compliant (+${bd.data_residency_bonus} pts)`);
    if (bd.lead_time_penalty < 0)             flags.push(`lead time: ${bd.lead_time_status} (${bd.lead_time_penalty} pts)`);

    reasonings.push({
      step_id:   `R-SR-${String(step++).padStart(3, "0")}`,
      aspect:    `Rank #${entry.rank} — ${entry.supplier_name ?? entry.supplier_id}`,
      reasoning: [
        `Final score: ${bd.final_score.toFixed(2)} pts.`,
        `Components — price: ${bd.price_raw.toFixed(1)}×${(weights.price / 100).toFixed(3)}`,
        `| quality: ${bd.quality_raw.toFixed(1)}×${(weights.quality / 100).toFixed(3)}`,
        `| risk: ${bd.risk_raw.toFixed(1)}×${(weights.risk / 100).toFixed(3)}`,
        `| ESG: ${bd.esg_raw.toFixed(1)}×${(weights.esg / 100).toFixed(3)}`,
        `= base ${bd.base_score.toFixed(2)}.`,
        flags.length ? `Notes: ${flags.join("; ")}.` : "",
        `Quote: ${entry.total_price.toFixed(2)} ${currency} std`,
        `(${entry.standard_lead_time_days}d std / ${entry.expedited_lead_time_days > 0 ? `${entry.expedited_lead_time_days}d exp` : "no exp"}).`,
      ].filter(Boolean).join(" "),
    });
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const winner        = ranked[0];
  const policyPref    = ranked.find((e) => e.preferred_supplier === true);
  const reqPref       = ranked.find((e) => e.is_requester_preferred);

  reasonings.push({
    step_id:   `R-SR-${String(step++).padStart(3, "0")}`,
    aspect:    "Ranking Summary",
    reasoning: [
      `${ranked.length} supplier(s) ranked.`,
      `Top recommendation: ${winner?.supplier_name} (score ${winner?.ranking_score.toFixed(2)}).`,
      policyPref
        ? policyPref.rank === 1
          ? `Policy-preferred supplier (${policyPref.supplier_name}) is the top recommendation.`
          : `Policy-preferred supplier (${policyPref.supplier_name}) is ranked #${policyPref.rank} (score ${policyPref.ranking_score.toFixed(2)}).`
        : "No policy-preferred supplier in the shortlist.",
      reqPref
        ? reqPref.rank === 1
          ? `Requester's preferred supplier (${reqPref.supplier_name}) coincides with the top recommendation.`
          : `Requester's preferred supplier (${reqPref.supplier_name ?? preferredRaw}) is ranked #${reqPref.rank}.`
        : preferredRaw
          ? `Requester's preferred supplier (${interp.preferred_supplier_mentioned}) is not in the shortlist.`
          : "",
    ].filter(Boolean).join(" "),
  });

  console.log(`[scoring_and_ranking] top: ${winner?.supplier_name} (${winner?.ranking_score.toFixed(2)} pts), ${ranked.length} supplier(s)`);

  return NextResponse.json({
    issues: [], escalations: [], reasonings, policy_violations: [],
    supplier_shortlist: ranked,
  } satisfies NodeResult & { supplier_shortlist: ShortlistEntry[] });
}
