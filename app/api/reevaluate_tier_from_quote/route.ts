import { NextRequest, NextResponse } from "next/server";
import type { ApprovalTier, Escalation, Issue, NodeResult, PolicyEvaluation, Reasoning, RequestData } from "@/lib/request-data";

// ── Threshold table (mirrors approval_tier stage) ─────────────────────────────

type Threshold = {
  threshold_id: string;
  tier_number: number;
  currency: string;
  min_amount: number;
  max_amount: number;
  min_supplier_quotes: number;
  approvers: string[];
  deviation_approval_required_from: string[];
};

const THRESHOLDS: Threshold[] = [
  // EUR
  { threshold_id: "AT-001", tier_number: 1, currency: "EUR", min_amount: 0,       max_amount: 24999.99,   min_supplier_quotes: 1, approvers: ["Business"],                deviation_approval_required_from: [] },
  { threshold_id: "AT-002", tier_number: 2, currency: "EUR", min_amount: 25000,   max_amount: 99999.99,   min_supplier_quotes: 2, approvers: ["Business", "Procurement"], deviation_approval_required_from: ["Procurement Manager"] },
  { threshold_id: "AT-003", tier_number: 3, currency: "EUR", min_amount: 100000,  max_amount: 499999.99,  min_supplier_quotes: 3, approvers: ["Procurement"],             deviation_approval_required_from: ["Head of Category"] },
  { threshold_id: "AT-004", tier_number: 4, currency: "EUR", min_amount: 500000,  max_amount: 4999999.99, min_supplier_quotes: 3, approvers: ["Procurement"],             deviation_approval_required_from: ["Head of Strategic Sourcing"] },
  { threshold_id: "AT-005", tier_number: 5, currency: "EUR", min_amount: 5000000, max_amount: Infinity,   min_supplier_quotes: 3, approvers: ["Procurement"],             deviation_approval_required_from: ["CPO"] },
  // CHF
  { threshold_id: "AT-006", tier_number: 1, currency: "CHF", min_amount: 0,       max_amount: 24999.99,   min_supplier_quotes: 1, approvers: ["Business"],                deviation_approval_required_from: [] },
  { threshold_id: "AT-007", tier_number: 2, currency: "CHF", min_amount: 25000,   max_amount: 99999.99,   min_supplier_quotes: 2, approvers: ["Business", "Procurement"], deviation_approval_required_from: ["Procurement Manager"] },
  { threshold_id: "AT-008", tier_number: 3, currency: "CHF", min_amount: 100000,  max_amount: 499999.99,  min_supplier_quotes: 3, approvers: ["Procurement"],             deviation_approval_required_from: ["Head of Category"] },
  { threshold_id: "AT-009", tier_number: 4, currency: "CHF", min_amount: 500000,  max_amount: 4999999.99, min_supplier_quotes: 3, approvers: ["Procurement"],             deviation_approval_required_from: ["Head of Strategic Sourcing"] },
  { threshold_id: "AT-010", tier_number: 5, currency: "CHF", min_amount: 5000000, max_amount: Infinity,   min_supplier_quotes: 3, approvers: ["Procurement"],             deviation_approval_required_from: ["CPO"] },
  // USD
  { threshold_id: "AT-011", tier_number: 1, currency: "USD", min_amount: 0,       max_amount: 27000,      min_supplier_quotes: 1, approvers: ["Business"],                deviation_approval_required_from: [] },
  { threshold_id: "AT-012", tier_number: 2, currency: "USD", min_amount: 27000,   max_amount: 108000,     min_supplier_quotes: 2, approvers: ["Business", "Procurement"], deviation_approval_required_from: ["Procurement Manager"] },
  { threshold_id: "AT-013", tier_number: 3, currency: "USD", min_amount: 108000,  max_amount: 540000,     min_supplier_quotes: 3, approvers: ["Procurement"],             deviation_approval_required_from: ["Head of Category"] },
  { threshold_id: "AT-014", tier_number: 4, currency: "USD", min_amount: 540000,  max_amount: 5400000,    min_supplier_quotes: 3, approvers: ["Procurement"],             deviation_approval_required_from: ["Head of Strategic Sourcing"] },
  { threshold_id: "AT-015", tier_number: 5, currency: "USD", min_amount: 5400000, max_amount: Infinity,   min_supplier_quotes: 3, approvers: ["Procurement"],             deviation_approval_required_from: ["CPO"] },
];

function findThreshold(currency: string, amount: number): Threshold | null {
  return THRESHOLDS.find(
    (t) => t.currency === currency && amount >= t.min_amount && amount <= t.max_amount
  ) ?? null;
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const data = await req.json() as RequestData;
  const interp = data.request_interpretation;

  const currency           = (interp.currency ?? "EUR").toUpperCase();
  const budget_amount      = interp.budget_amount ?? 0;
  const fast_track_eligible = interp.fast_track_eligible ?? false;
  const currentTier        = data.approval_tier;
  const shortlist          = data.supplier_shortlist;

  const issues:            Issue[]            = [];
  const escalations:       Escalation[]       = [];
  const reasonings:        Reasoning[]        = [];
  const policy_violations: PolicyEvaluation[] = [];

  let step = 1;
  let esc  = 1;
  let iss  = 1;

  console.log(`[reevaluate_tier] ${shortlist.length} quote(s), current tier=${currentTier?.tier_number ?? "none"}, fast_track=${fast_track_eligible}`);

  // ── Guards ────────────────────────────────────────────────────────────────
  if (shortlist.length === 0) {
    reasonings.push({
      step_id:   `R-RT-${String(step++).padStart(3, "0")}`,
      aspect:    "Tier Re-evaluation — No Quotes",
      reasoning: "No supplier quotes are available. Tier re-evaluation skipped.",
    });
    return NextResponse.json({ issues, escalations, reasonings, policy_violations } satisfies NodeResult);
  }

  if (!currentTier) {
    reasonings.push({
      step_id:   `R-RT-${String(step++).padStart(3, "0")}`,
      aspect:    "Tier Re-evaluation — No Approval Tier",
      reasoning: "No approval tier was set by the approval_tier stage. Re-evaluation skipped.",
    });
    return NextResponse.json({ issues, escalations, reasonings, policy_violations } satisfies NodeResult);
  }

  // ── Find highest quote ────────────────────────────────────────────────────
  const highestTotal   = Math.max(...shortlist.map((s) => s.total_price));
  const highestSupplier = shortlist.find((s) => s.total_price === highestTotal);

  reasonings.push({
    step_id:   `R-RT-${String(step++).padStart(3, "0")}`,
    aspect:    "Quote Analysis",
    reasoning: `${shortlist.length} supplier quote(s) received. Highest quote: ${highestTotal.toFixed(2)} ${currency} (${highestSupplier?.supplier_name ?? "unknown"}). Budget stated in request: ${budget_amount} ${currency}. Budget-based tier: ${currentTier.threshold_id} (Tier ${currentTier.tier_number}, requires ${currentTier.min_supplier_quotes} quote(s)).`,
  });

  // ── Determine tier from actual quote ──────────────────────────────────────
  const quoteTier = findThreshold(currency, highestTotal);

  if (!quoteTier) {
    reasonings.push({
      step_id:   `R-RT-${String(step++).padStart(3, "0")}`,
      aspect:    "Tier Re-evaluation — Lookup Failed",
      reasoning: `Could not determine approval tier for quote of ${highestTotal.toFixed(2)} ${currency}. Retaining current tier ${currentTier.threshold_id}.`,
    });
  }

  // ── Compare tiers and escalate if changed ─────────────────────────────────
  let effectiveTier = currentTier;
  let tierChanged   = false;

  if (quoteTier && quoteTier.tier_number !== currentTier.tier_number) {
    tierChanged = true;
    const direction  = quoteTier.tier_number > currentTier.tier_number ? "higher" : "lower";
    const discrepancy = Math.abs(highestTotal - budget_amount);

    policy_violations.push({
      policy:      quoteTier.threshold_id,
      description: `Actual quote of ${highestTotal.toFixed(2)} ${currency} maps to ${quoteTier.threshold_id} (Tier ${quoteTier.tier_number}), ${direction} than the budget-based ${currentTier.threshold_id} (Tier ${currentTier.tier_number}). Budget discrepancy: ${discrepancy.toFixed(2)} ${currency}.`,
    });

    reasonings.push({
      step_id:   `R-RT-${String(step++).padStart(3, "0")}`,
      aspect:    `Tier Changed — ${currentTier.threshold_id} → ${quoteTier.threshold_id}`,
      reasoning: `Budget of ${budget_amount} ${currency} placed the request in ${currentTier.threshold_id} (Tier ${currentTier.tier_number}). However, the highest actual quote is ${highestTotal.toFixed(2)} ${currency}, which maps to ${quoteTier.threshold_id} (Tier ${quoteTier.tier_number}) — a ${direction} tier. Discrepancy: ${discrepancy.toFixed(2)} ${currency} ${direction === "higher" ? "above" : "below"} budget. Approval tier updated. ER-003 escalation filed.`,
    });

    escalations.push({
      escalation_id: `ESC-RT-${String(esc++).padStart(3, "0")}`,
      rule:          "ER-003",
      trigger:       `Quote of ${highestTotal.toFixed(2)} ${currency} (${highestSupplier?.supplier_name}) places request in ${quoteTier.threshold_id} (Tier ${quoteTier.tier_number}), ${direction} than budget-based ${currentTier.threshold_id} (Tier ${currentTier.tier_number})`,
      escalate_to:   "Head of Strategic Sourcing",
      blocking:      false,
    });

    effectiveTier = {
      ...currentTier,
      threshold_id:                    quoteTier.threshold_id,
      tier_number:                     quoteTier.tier_number,
      min_supplier_quotes:             quoteTier.min_supplier_quotes,
      approvers:                       quoteTier.approvers,
      deviation_approval_required_from: quoteTier.deviation_approval_required_from,
      llm_involved:                    false,
    };
  } else if (quoteTier) {
    policy_violations.push({
      policy:      quoteTier.threshold_id,
      description: `Quote of ${highestTotal.toFixed(2)} ${currency} is within the same tier as the budget-based assessment (${quoteTier.threshold_id}, Tier ${quoteTier.tier_number}). No tier change required.`,
    });
    reasonings.push({
      step_id:   `R-RT-${String(step++).padStart(3, "0")}`,
      aspect:    "Tier Re-evaluation — No Change",
      reasoning: `Highest quote of ${highestTotal.toFixed(2)} ${currency} maps to ${quoteTier.threshold_id} (Tier ${quoteTier.tier_number}), consistent with the budget-based tier. No update required.`,
    });
  }

  // ── Quote sufficiency check ───────────────────────────────────────────────
  const requiredQuotes = fast_track_eligible ? 1 : effectiveTier.min_supplier_quotes;
  const actualQuotes   = shortlist.length;

  if (fast_track_eligible && effectiveTier.min_supplier_quotes > 1) {
    reasonings.push({
      step_id:   `R-RT-${String(step++).padStart(3, "0")}`,
      aspect:    "CR-003 Fast-Track Exception",
      reasoning: `CR-003 fast-track applies (IT/Break-Fix Pool Devices below EUR/CHF 75,000). ${effectiveTier.threshold_id} normally requires ${effectiveTier.min_supplier_quotes} quotes — overridden to 1 by CR-003.`,
    });
  }

  if (actualQuotes < requiredQuotes) {
    issues.push({
      issue_id:    `ISS-RT-${String(iss++).padStart(3, "0")}`,
      trigger:     `${actualQuotes} quote(s) available but ${requiredQuotes} required under ${effectiveTier.threshold_id} (Tier ${effectiveTier.tier_number})`,
      escalate_to: "Head of Category",
      blocking:    true,
      severity:    "critical",
    });
    reasonings.push({
      step_id:   `R-RT-${String(step++).padStart(3, "0")}`,
      aspect:    `Quote Sufficiency — Insufficient (${effectiveTier.threshold_id})`,
      reasoning: `${effectiveTier.threshold_id} (Tier ${effectiveTier.tier_number}) requires ${requiredQuotes} supplier quote(s)${fast_track_eligible ? " (CR-003 fast-track applied)" : ""}. Only ${actualQuotes} quote(s) received. Insufficient competition — pipeline blocked.`,
    });
  } else {
    reasonings.push({
      step_id:   `R-RT-${String(step++).padStart(3, "0")}`,
      aspect:    `Quote Sufficiency — Met (${effectiveTier.threshold_id})`,
      reasoning: `${effectiveTier.threshold_id} (Tier ${effectiveTier.tier_number}) requires ${requiredQuotes} quote(s)${fast_track_eligible ? " (CR-003 fast-track applied)" : ""}. ${actualQuotes} quote(s) available — requirement met.`,
    });
  }

  console.log(`[reevaluate_tier] tier=${effectiveTier.tier_number} (changed=${tierChanged}), quotes=${actualQuotes}/${requiredQuotes}, blocking=${issues.some((i) => i.blocking)}`);

  const result: NodeResult & { approval_tier?: ApprovalTier } = {
    issues,
    escalations,
    reasonings,
    policy_violations,
    ...(tierChanged ? { approval_tier: effectiveTier } : {}),
  };
  return NextResponse.json(result);
}
