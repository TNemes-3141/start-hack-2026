import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import type { ApprovalTier, Escalation, Issue, NodeResult, Reasoning, RequestData } from "@/lib/request-data";

const client = new OpenAI();

// ── Unified threshold table ────────────────────────────────────────────────────

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
  { threshold_id: "AT-001", tier_number: 1, currency: "EUR", min_amount: 0,       max_amount: 24999.99,    min_supplier_quotes: 1, approvers: ["Business"],                 deviation_approval_required_from: [] },
  { threshold_id: "AT-002", tier_number: 2, currency: "EUR", min_amount: 25000,   max_amount: 99999.99,    min_supplier_quotes: 2, approvers: ["Business", "Procurement"],  deviation_approval_required_from: ["Procurement Manager"] },
  { threshold_id: "AT-003", tier_number: 3, currency: "EUR", min_amount: 100000,  max_amount: 499999.99,   min_supplier_quotes: 3, approvers: ["Procurement"],              deviation_approval_required_from: ["Head of Category"] },
  { threshold_id: "AT-004", tier_number: 4, currency: "EUR", min_amount: 500000,  max_amount: 4999999.99,  min_supplier_quotes: 3, approvers: ["Procurement"],              deviation_approval_required_from: ["Head of Strategic Sourcing"] },
  { threshold_id: "AT-005", tier_number: 5, currency: "EUR", min_amount: 5000000, max_amount: Infinity,    min_supplier_quotes: 3, approvers: ["Procurement"],              deviation_approval_required_from: ["CPO"] },
  // CHF
  { threshold_id: "AT-006", tier_number: 1, currency: "CHF", min_amount: 0,       max_amount: 24999.99,    min_supplier_quotes: 1, approvers: ["Business"],                 deviation_approval_required_from: [] },
  { threshold_id: "AT-007", tier_number: 2, currency: "CHF", min_amount: 25000,   max_amount: 99999.99,    min_supplier_quotes: 2, approvers: ["Business", "Procurement"],  deviation_approval_required_from: ["Procurement Manager"] },
  { threshold_id: "AT-008", tier_number: 3, currency: "CHF", min_amount: 100000,  max_amount: 499999.99,   min_supplier_quotes: 3, approvers: ["Procurement"],              deviation_approval_required_from: ["Head of Category"] },
  { threshold_id: "AT-009", tier_number: 4, currency: "CHF", min_amount: 500000,  max_amount: 4999999.99,  min_supplier_quotes: 3, approvers: ["Procurement"],              deviation_approval_required_from: ["Head of Strategic Sourcing"] },
  { threshold_id: "AT-010", tier_number: 5, currency: "CHF", min_amount: 5000000, max_amount: Infinity,    min_supplier_quotes: 3, approvers: ["Procurement"],              deviation_approval_required_from: ["CPO"] },
  // USD
  { threshold_id: "AT-011", tier_number: 1, currency: "USD", min_amount: 0,       max_amount: 27000,       min_supplier_quotes: 1, approvers: ["Business"],                 deviation_approval_required_from: [] },
  { threshold_id: "AT-012", tier_number: 2, currency: "USD", min_amount: 27000,   max_amount: 108000,      min_supplier_quotes: 2, approvers: ["Business", "Procurement"],  deviation_approval_required_from: ["Procurement Manager"] },
  { threshold_id: "AT-013", tier_number: 3, currency: "USD", min_amount: 108000,  max_amount: 540000,      min_supplier_quotes: 3, approvers: ["Procurement"],              deviation_approval_required_from: ["Head of Category"] },
  { threshold_id: "AT-014", tier_number: 4, currency: "USD", min_amount: 540000,  max_amount: 5400000,     min_supplier_quotes: 3, approvers: ["Procurement"],              deviation_approval_required_from: ["Head of Strategic Sourcing"] },
  { threshold_id: "AT-015", tier_number: 5, currency: "USD", min_amount: 5400000, max_amount: Infinity,    min_supplier_quotes: 3, approvers: ["Procurement"],              deviation_approval_required_from: ["CPO"] },
];

// Escalation targets per tier (tier 1 = Business only → no escalation)
const TIER_ESCALATION_TARGET: Record<number, string> = {
  2: "Procurement Manager",
  3: "Head of Category",
  4: "Head of Strategic Sourcing",
  5: "CPO",
};

function findThreshold(currency: string, budget: number): Threshold | null {
  return THRESHOLDS.find(
    (t) => t.currency === currency.toUpperCase() && budget >= t.min_amount && budget <= t.max_amount
  ) ?? null;
}

type BoundaryInfo =
  | { isBoundary: false; boundaryValue: null; lowerTier: null; upperTier: null }
  | { isBoundary: true; boundaryValue: number; lowerTier: Threshold; upperTier: Threshold };

function detectBoundary(currency: string, budget: number): BoundaryInfo {
  const currThresholds = THRESHOLDS.filter((t) => t.currency === currency.toUpperCase());
  const boundaries = currThresholds.filter((t) => t.tier_number > 1);

  for (const upper of boundaries) {
    const b = upper.min_amount;
    if (Math.abs(budget - b) / b <= 0.05) {
      const lower = currThresholds.find((t) => t.tier_number === upper.tier_number - 1)!;
      return { isBoundary: true, boundaryValue: b, lowerTier: lower, upperTier: upper };
    }
  }
  return { isBoundary: false, boundaryValue: null, lowerTier: null, upperTier: null };
}

// ── LLM prompt ────────────────────────────────────────────────────────────────

const PROMPT = `You are a senior procurement compliance officer finalising the approval tier for a purchase request that falls near a tier boundary.

You will receive a JSON object with:
- "request_summary": key fields of the purchase request
- "boundary_value": the exact threshold amount that separates the two candidate tiers
- "lower_tier": the tier immediately BELOW the boundary (applies when budget < boundary)
- "upper_tier": the tier immediately ABOVE the boundary (applies when budget >= boundary)
- "budget_position": whether the budget is just below or just above the boundary
- "pipeline_issues": all issues raised by earlier pipeline stages
- "pipeline_escalations": all escalations raised by earlier pipeline stages
- "historical_precedents_summary": brief summary of similar past requests and their outcomes

CRITICAL RULES:
- Your decision is ONLY between "lower_tier" and "upper_tier". These are the two tiers that share this specific boundary. You MUST NOT select any other tier.
- If the budget is slightly BELOW the boundary: decide whether it belongs in the lower tier or should be bumped UP to the upper tier.
- If the budget is slightly ABOVE the boundary: decide whether it belongs in the upper tier or could be moved DOWN to the lower tier.
- Base your decision on risk signals from earlier pipeline stages and historical precedents. If risk signals are elevated, prefer the higher of the two. If the request looks clean and routine, the statically determined tier is likely correct.
- Do NOT automatically tier up. Only move to the higher tier if there is a specific reason (risk signals, policy concerns, escalations from earlier stages).

Respond with a JSON object with exactly these fields:
{
  "final_tier_number": <integer — MUST be either lower_tier.tier_number or upper_tier.tier_number>,
  "escalate_to_procurement_at_minimum": <boolean — true if you raised the tier or there are notable risk signals>,
  "reasoning": "<detailed explanation of your decision, referencing specific signals and why you chose one tier over the other>"
}

Return only valid JSON. No markdown, no extra text.`;

// ── Summarise RequestData context for the LLM ─────────────────────────────────

function buildLLMContext(data: RequestData, boundaryValue: number, lowerTier: Threshold, upperTier: Threshold) {
  const interp = data.request_interpretation;
  const budget = interp.budget_amount ?? 0;

  // Collect all issues and escalations from stages run so far
  const allIssues = Object.values(data.stages).flatMap((s) => s.issues);
  const allEscalations = Object.values(data.stages).flatMap((s) => s.escalations);

  // Brief precedent summary
  const precedentSummary = data.historical_precedents.map((p) => {
    const winner = p.awards.find((a) => a.awarded);
    const escalated = p.awards.some((a) => a.escalation_required);
    return `${p.request_id}: awarded to ${winner?.supplier_name ?? "unknown"}, escalated=${escalated}`;
  });

  return {
    request_summary: {
      category: `${interp.category_l1} / ${interp.category_l2}`,
      quantity: interp.quantity,
      unit_of_measure: interp.unit_of_measure,
      budget_amount: budget,
      currency: interp.currency,
      required_by_date: interp.required_by_date,
      country: interp.country,
      business_unit: interp.business_unit,
      preferred_supplier_mentioned: interp.preferred_supplier_mentioned,
      esg_requirement: interp.esg_requirement,
    },
    boundary_value: boundaryValue,
    budget_position: budget < boundaryValue ? "just_below_boundary" : "just_above_boundary",
    lower_tier: {
      tier_number: lowerTier.tier_number,
      threshold_id: lowerTier.threshold_id,
      range: `${lowerTier.min_amount} – ${lowerTier.max_amount} ${lowerTier.currency}`,
      min_supplier_quotes: lowerTier.min_supplier_quotes,
      approvers: lowerTier.approvers,
    },
    upper_tier: {
      tier_number: upperTier.tier_number,
      threshold_id: upperTier.threshold_id,
      range: `${upperTier.min_amount} – ${upperTier.max_amount} ${upperTier.currency}`,
      min_supplier_quotes: upperTier.min_supplier_quotes,
      approvers: upperTier.approvers,
    },
    pipeline_issues: allIssues.map((i) => ({ id: i.issue_id, trigger: i.trigger, severity: i.severity, blocking: i.blocking })),
    pipeline_escalations: allEscalations.map((e) => ({ id: e.escalation_id, rule: e.rule, trigger: e.trigger, escalate_to: e.escalate_to })),
    historical_precedents_summary: precedentSummary,
  };
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const data = await req.json() as RequestData;
  const interp = data.request_interpretation;

  const currency = (interp.currency ?? "").toUpperCase();
  const budget = interp.budget_amount ?? 0;

  console.log(`[approval_tier] currency=${currency}, budget=${budget}`);

  const issues: Issue[] = [];
  const escalations: Escalation[] = [];
  const reasonings: Reasoning[] = [];

  // ── 1. Static tier lookup ──────────────────────────────────────────────────
  const staticTier = findThreshold(currency, budget);

  if (!staticTier) {
    reasonings.push({
      step_id: "R-AT-001",
      aspect: "Tier Lookup",
      reasoning: `Could not determine approval tier for currency=${currency}, budget=${budget}. No matching threshold found.`,
    });
    const result: NodeResult & { approval_tier: null } = {
      issues, escalations, reasonings, policy_violations: [], approval_tier: null,
    };
    return NextResponse.json(result);
  }

  // ── 2. Boundary detection ──────────────────────────────────────────────────
  const { isBoundary, boundaryValue, lowerTier, upperTier } = detectBoundary(currency, budget);

  if (isBoundary) {
    issues.push({
      issue_id: "ISS-AT-001",
      trigger: `Budget of ${budget} ${currency} is within ±5% of tier boundary at ${boundaryValue} ${currency}`,
      escalate_to: "Procurement Manager",
      blocking: false,
      severity: "low",
    });
    reasonings.push({
      step_id: "R-AT-002",
      aspect: "Boundary Case",
      reasoning: `Budget ${budget} ${currency} falls within ±5% of the tier boundary at ${boundaryValue} ${currency}. This is a boundary case requiring LLM review for conservative tier determination.`,
    });
  }

  // ── 3. LLM tier finalisation (invoked on boundary cases) ──────────────────
  let finalTierNumber = staticTier.tier_number;
  let llmInvolved = false;
  let escalateToProcurementMinimum = false;

  if (isBoundary) {
    llmInvolved = true;
    const context = buildLLMContext(data, boundaryValue!, lowerTier!, upperTier!);

    console.log(`[approval_tier] boundary case detected — invoking LLM`);
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: JSON.stringify(context) },
      ],
    });

    const llmResult = JSON.parse(completion.choices[0].message.content ?? "{}") as {
      final_tier_number: number;
      escalate_to_procurement_at_minimum: boolean;
      reasoning: string;
    };

    finalTierNumber = llmResult.final_tier_number ?? staticTier.tier_number;
    escalateToProcurementMinimum = llmResult.escalate_to_procurement_at_minimum ?? true;

    reasonings.push({
      step_id: "R-AT-003",
      aspect: "LLM Tier Decision",
      reasoning: llmResult.reasoning ?? "LLM did not provide reasoning.",
    });

    console.log(`[approval_tier] LLM decided tier=${finalTierNumber}, escalateToProc=${escalateToProcurementMinimum}`);
  } else {
    reasonings.push({
      step_id: "R-AT-002",
      aspect: "Tier Determination",
      reasoning: `Budget ${budget} ${currency} maps to Tier ${staticTier.tier_number} (${staticTier.threshold_id}). Requires ${staticTier.min_supplier_quotes} supplier quote(s). Approvers: ${staticTier.approvers.join(", ")}.`,
    });
  }

  // ── 4. Resolve final threshold object ─────────────────────────────────────
  const finalThreshold = THRESHOLDS.find(
    (t) => t.currency === currency && t.tier_number === finalTierNumber
  ) ?? staticTier;

  // ── 5. Produce escalation based on final tier ──────────────────────────────
  const escalationTarget = TIER_ESCALATION_TARGET[finalThreshold.tier_number];

  if (escalationTarget) {
    escalations.push({
      escalation_id: "ESC-AT-001",
      rule: "ER-000",
      trigger: `Approval tier ${finalThreshold.tier_number} (${finalThreshold.threshold_id}) requires ${finalThreshold.deviation_approval_required_from.join(", ")} sign-off`,
      escalate_to: escalationTarget,
      blocking: false,
    });
  } else if (escalateToProcurementMinimum) {
    // LLM involved but tier 1 — still escalate to Procurement as minimum
    escalations.push({
      escalation_id: "ESC-AT-001",
      rule: "ER-000",
      trigger: `LLM review involved in tier determination — escalating to Procurement as minimum per policy`,
      escalate_to: "Procurement Manager",
      blocking: false,
    });
  }

  // ── 6. Build ApprovalTier output ───────────────────────────────────────────
  const approval_tier: ApprovalTier = {
    threshold_id: finalThreshold.threshold_id,
    tier_number: finalThreshold.tier_number,
    currency,
    budget_amount: budget,
    min_supplier_quotes: finalThreshold.min_supplier_quotes,
    approvers: finalThreshold.approvers,
    deviation_approval_required_from: finalThreshold.deviation_approval_required_from,
    is_boundary_case: isBoundary,
    boundary_value: boundaryValue,
    llm_involved: llmInvolved,
  };

  console.log(`[approval_tier] final tier=${finalThreshold.tier_number}, llm=${llmInvolved}, escalations=${escalations.length}`);

  const result: NodeResult & { approval_tier: ApprovalTier } = {
    issues,
    escalations,
    reasonings,
    policy_violations: [],
    approval_tier,
  };
  return NextResponse.json(result);
}
