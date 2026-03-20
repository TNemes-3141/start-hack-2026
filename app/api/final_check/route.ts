import { NextRequest, NextResponse } from "next/server";
import type { NodeResult, Reasoning, RequestData } from "@/lib/request-data";

export async function POST(req: NextRequest) {
  const data = await req.json() as RequestData;
  const interp   = data.request_interpretation;
  const shortlist = data.supplier_shortlist ?? [];
  const excluded  = data.suppliers_excluded ?? [];
  const tier      = data.approval_tier;

  const reasonings: Reasoning[] = [];
  let step = 1;

  // ── Check for blocking escalations across all stages ──────────────────────
  const blockingEscalations = Object.values(data.stages).flatMap((s) =>
    s.escalations?.filter((e) => e.blocking) ?? [],
  );
  const blockingIssues = Object.values(data.stages).flatMap((s) =>
    s.issues?.filter((i) => i.blocking) ?? [],
  );
  const hasBlocking = blockingEscalations.length > 0 || blockingIssues.length > 0;

  // ── Build recommendation ──────────────────────────────────────────────────
  let recStatus        = "";
  let recReason        = "";
  let recPreferred     = "";
  let recRationale     = "";
  let recMinBudget     = 0;
  let recMinCurrency   = interp.currency ?? "";

  if (hasBlocking) {
    recStatus = "escalated";
    const firstEsc = blockingEscalations[0] ?? blockingIssues[0];
    recReason = firstEsc
      ? `Pipeline blocked: ${firstEsc.trigger ?? "blocking issue detected"}`
      : "Pipeline blocked by a critical issue. Manual review required.";

    reasonings.push({
      step_id:   `R-FC-${String(step++).padStart(3, "0")}`,
      aspect:    "Recommendation — Blocked",
      reasoning: `Pipeline has ${blockingEscalations.length} blocking escalation(s) and ${blockingIssues.length} blocking issue(s). Recommendation cannot be finalised without human intervention.`,
    });

  } else if (shortlist.length === 0) {
    recStatus = "no_compliant_supplier";
    recReason = "No compliant suppliers could be identified for this request after applying all eligibility, restriction, and geography filters.";
    if (excluded.length > 0) {
      recReason += ` ${excluded.length} supplier(s) were excluded.`;
    }
    reasonings.push({
      step_id:   `R-FC-${String(step++).padStart(3, "0")}`,
      aspect:    "Recommendation — No Supplier",
      reasoning: `After filtering, the supplier shortlist is empty. ${excluded.length} supplier(s) were excluded during eligibility and policy checks.`,
    });

  } else {
    const winner = shortlist[0];
    const policyPref = shortlist.find((s) => s.preferred_supplier === true);
    const reqPref    = shortlist.find((s) => s.is_requester_preferred);

    recStatus    = "recommend_award";
    recPreferred = winner.supplier_name ?? winner.supplier_id;
    recRationale = `Ranked #1 with score ${winner.ranking_score?.toFixed(2) ?? "N/A"} pts based on price, quality, risk, and ESG criteria.`;

    if (winner.standard_lead_time_days > 0) {
      recRationale += ` Standard lead time: ${winner.standard_lead_time_days} days.`;
    }

    recReason = `${shortlist.length} supplier(s) evaluated. ${recPreferred} recommended as best value-for-money option.`;

    if (tier) {
      recReason += ` Approval required from: ${tier.approvers.join(", ")} (Tier ${tier.tier_number}, min ${tier.min_supplier_quotes} quote(s)).`;
    }

    // Minimum budget note
    if (winner.total_price > 0) {
      recMinBudget   = winner.total_price;
      recMinCurrency = winner.currency ?? interp.currency ?? "";
    }

    reasonings.push({
      step_id:   `R-FC-${String(step++).padStart(3, "0")}`,
      aspect:    "Final Recommendation",
      reasoning: [
        `${shortlist.length} supplier(s) ranked. Recommended: ${recPreferred} (score ${winner.ranking_score?.toFixed(2)}).`,
        policyPref?.rank === 1
          ? `Policy-preferred supplier is the top recommendation.`
          : policyPref
            ? `Policy-preferred supplier (${policyPref.supplier_name}) ranked #${policyPref.rank}.`
            : "No policy-preferred supplier in the shortlist.",
        reqPref
          ? reqPref.supplier_id === winner.supplier_id
            ? `Requester's preferred supplier coincides with the top recommendation.`
            : `Requester's preferred supplier (${reqPref.supplier_name}) ranked #${reqPref.rank}.`
          : interp.preferred_supplier_mentioned
            ? `Requester's preferred supplier (${interp.preferred_supplier_mentioned}) not in the final shortlist.`
            : "",
      ].filter(Boolean).join(" "),
    });
  }

  // ── Build audit trail ─────────────────────────────────────────────────────
  const policiesChecked: string[] = [];
  Object.values(data.stages).forEach((s) => {
    s.policy_violations?.forEach((pv) => {
      if (!policiesChecked.includes(pv.policy)) policiesChecked.push(pv.policy);
    });
  });
  // Always list core policies checked
  const alwaysChecked = [
    "Approval Thresholds",
    "Preferred Suppliers",
    "Restricted Suppliers",
    "Category Rules",
    "Geography Rules",
    "Escalation Rules",
  ];
  alwaysChecked.forEach((p) => { if (!policiesChecked.includes(p)) policiesChecked.push(p); });

  const supplierIdsEvaluated = shortlist.map((s) => s.supplier_id);
  const hasHistorical = (data.historical_precedents?.length ?? 0) > 0;
  const historicalNote = hasHistorical
    ? `${data.historical_precedents.length} historical award(s) consulted for category ${interp.category_l2 ?? interp.category_l1}.`
    : "No historical awards found for this category/country combination.";

  const pricingTiersApplied = shortlist
    .map((s) => s.pricing_tier_applied)
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(", ");

  const dataSources = ["suppliers", "pricing", "categories", "policies"];
  if (hasHistorical) dataSources.push("historical_awards");

  reasonings.push({
    step_id:   `R-FC-${String(step++).padStart(3, "0")}`,
    aspect:    "Audit Trail",
    reasoning: [
      `Policies checked: ${alwaysChecked.join(", ")}.`,
      `${supplierIdsEvaluated.length} supplier(s) evaluated.`,
      `${excluded.length} supplier(s) excluded.`,
      historicalNote,
      pricingTiersApplied ? `Pricing tiers applied: ${pricingTiersApplied}.` : "",
    ].filter(Boolean).join(" "),
  });

  console.log(`[final_check] status=${recStatus}, shortlist=${shortlist.length}, blocked=${hasBlocking}`);

  return NextResponse.json({
    issues:           [],
    escalations:      [],
    reasonings,
    policy_violations: [],
    recommendation: {
      status:                         recStatus,
      reason:                         recReason,
      preferred_supplier_if_resolved: recPreferred,
      preferred_supplier_rationale:   recRationale,
      minimum_budget_required:        recMinBudget,
      minimum_budget_currency:        recMinCurrency,
    },
    audit_trail: {
      policies_checked:           policiesChecked,
      supplier_ids_evaluated:     supplierIdsEvaluated,
      pricing_tiers_applied:      pricingTiersApplied,
      data_sources_used:          dataSources,
      historical_awards_consulted: hasHistorical,
      historical_award_note:      historicalNote,
    },
  } satisfies NodeResult & {
    recommendation: RequestData["recommendation"];
    audit_trail: RequestData["audit_trail"];
  });
}
