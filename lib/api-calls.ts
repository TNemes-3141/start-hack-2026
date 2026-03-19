import type { NodeResult, RequestDataPatch, RequestInterpretation, StageId } from "./request-data";

// ── Generic fetch ─────────────────────────────────────────────────────────────

const EMPTY_NODE_RESULT: NodeResult = { issues: [], escalations: [], reasonings: [], policy_violations: [] };

async function fetchApi(endpoint: string, input: unknown): Promise<NodeResult> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    console.error(`[fetchApi] ${endpoint} returned ${res.status}`);
    return EMPTY_NODE_RESULT;
  }
  try {
    return await res.json();
  } catch {
    console.error(`[fetchApi] ${endpoint} returned non-JSON body`);
    return EMPTY_NODE_RESULT;
  }
}

/** Wraps a raw NodeResult response into a RequestDataPatch targeting a specific stage slot. */
function wrapStage(stageId: StageId, raw: NodeResult): RequestDataPatch {
  return {
    stages: {
      [stageId]: {
        issues: raw.issues ?? [],
        escalations: raw.escalations ?? [],
        reasonings: raw.reasonings ?? [],
        policy_violations: raw.policy_violations ?? [],
      },
    },
  };
}

// ── Named API call wrappers ───────────────────────────────────────────────────
// Each returns a RequestDataPatch that targets its own stage slot.
// Add new nodes here as the pipeline grows.

export async function translateCall(input: string): Promise<RequestDataPatch> {
  const raw = await fetchApi("/api/translate", input) as NodeResult & { request_interpretation?: Partial<RequestInterpretation> };
  return {
    // translate also writes request_text back into request_interpretation
    ...(raw.request_interpretation ? { request_interpretation: raw.request_interpretation } : {}),
    ...wrapStage("translation", raw),
  };
}

export const internalCoherenceCall     = (input: unknown) => fetchApi("/api/internal_coherence",     input).then(r => wrapStage("internal_coherence",     r));
export const missingRequiredDataCall   = (input: unknown) => fetchApi("/api/missing_required_data",   input).then(r => wrapStage("missing_required_data",   r));
export const checkAvailableProductsCall = (input: unknown) => fetchApi("/api/check_available_products", input).then(r => wrapStage("check_available_products", r));

// Stubs for upcoming nodes — wire up endpoints as they are built
// export const inappropriateRequestsCall   = (input: unknown) => fetchApi("/api/inappropriate_requests",   input).then(r => wrapStage("inappropriate_requests",   r));
// export const applyCategoryRulesCall      = (input: unknown) => fetchApi("/api/apply_category_rules",      input).then(r => wrapStage("apply_category_rules",      r));
// export const approvalTierCall            = (input: unknown) => fetchApi("/api/approval_tier",            input).then(r => wrapStage("approval_tier",            r));
// export const precedenceLookupCall        = (input: unknown) => fetchApi("/api/precedence_lookup",        input).then(r => wrapStage("precedence_lookup",        r));
// export const purelyEligibleSuppliersCall = (input: unknown) => fetchApi("/api/purely_eligible_suppliers", input).then(r => wrapStage("purely_eligible_suppliers", r));
// export const restrictedSuppliersCall     = (input: unknown) => fetchApi("/api/restricted_suppliers",     input).then(r => wrapStage("restricted_suppliers",     r));
// export const checkEligibleSuppliersCall  = (input: unknown) => fetchApi("/api/check_eligible_suppliers",  input).then(r => wrapStage("check_eligible_suppliers",  r));
// export const pricingCalculationCall      = (input: unknown) => fetchApi("/api/pricing_calculation",      input).then(r => wrapStage("pricing_calculation",      r));
// export const reevaluateTierCall          = (input: unknown) => fetchApi("/api/reevaluate_tier_from_quote", input).then(r => wrapStage("reevaluate_tier_from_quote", r));
// export const scoringAndRankingCall       = (input: unknown) => fetchApi("/api/scoring_and_ranking",       input).then(r => wrapStage("scoring_and_ranking",       r));
