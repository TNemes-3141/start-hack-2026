import type { ApprovalTier, EligibleSupplier, HistoricalPrecedent, NodeResult, RequestData, RequestDataPatch, RequestInterpretation, StageId } from "./request-data";

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

export const internalCoherenceCall      = (input: unknown) => fetchApi("/api/internal_coherence",      input).then(r => wrapStage("internal_coherence",      r));
export const missingRequiredDataCall    = (input: unknown) => fetchApi("/api/missing_required_data",    input).then(r => wrapStage("missing_required_data",    r));
export const checkAvailableProductsCall = (input: unknown) => fetchApi("/api/check_available_products", input).then(r => wrapStage("check_available_products", r));
export const inappropriateRequestsCall  = (input: unknown) => fetchApi("/api/inappropriate_requests",   input).then(r => wrapStage("inappropriate_requests",   r));
export const applyStaticCategoryRulesCall = (input: unknown) => fetchApi("/api/apply_static_category_rules", input).then(r => wrapStage("apply_category_rules", r));

export async function approvalTierCall(input: RequestData): Promise<RequestDataPatch> {
  const raw = await fetchApi("/api/approval_tier", input) as NodeResult & { approval_tier?: ApprovalTier };
  return {
    ...(raw.approval_tier ? { approval_tier: raw.approval_tier } : {}),
    ...wrapStage("approval_tier", raw),
  };
}

export async function purelyEligibleSuppliersCall(input: unknown): Promise<RequestDataPatch> {
  const raw = await fetchApi("/api/purely_eligible_suppliers", input) as NodeResult & { eligible_suppliers?: EligibleSupplier[] };
  return {
    ...(raw.eligible_suppliers ? { eligible_suppliers: raw.eligible_suppliers } : {}),
    ...wrapStage("purely_eligible_suppliers", raw),
  };
}

export async function precedenceLookupCall(input: unknown): Promise<RequestDataPatch> {
  const raw = await fetchApi("/api/precedence_lookup", input) as NodeResult & { historical_precedents?: HistoricalPrecedent[] };
  return {
    ...(raw.historical_precedents ? { historical_precedents: raw.historical_precedents } : {}),
    ...wrapStage("precedence_lookup", raw),
  };
}

export async function restrictedSuppliersCall(input: RequestData): Promise<RequestDataPatch> {
  const raw = await fetchApi("/api/restricted_suppliers", input) as NodeResult & {
    eligible_suppliers?: EligibleSupplier[];
    suppliers_excluded?: { supplier_id: string; supplier_name: string; reason: string }[];
  };
  return {
    ...(raw.eligible_suppliers !== undefined ? { eligible_suppliers: raw.eligible_suppliers } : {}),
    ...(raw.suppliers_excluded?.length ? { suppliers_excluded: raw.suppliers_excluded } : {}),
    ...wrapStage("restricted_suppliers", raw),
  };
}
export async function geographicalRulesCall(input: RequestData): Promise<RequestDataPatch> {
  const raw = await fetchApi("/api/geographical_rules", input) as NodeResult & {
    eligible_suppliers?: EligibleSupplier[];
    suppliers_excluded?: { supplier_id: string; supplier_name: string; reason: string }[];
  };
  return {
    ...(raw.eligible_suppliers !== undefined ? { eligible_suppliers: raw.eligible_suppliers } : {}),
    ...(raw.suppliers_excluded?.length ? { suppliers_excluded: raw.suppliers_excluded } : {}),
    ...wrapStage("geographical_rules", raw),
  };
}
export const evaluatePreferredSupplierCall  = (input: unknown) => fetchApi("/api/evaluate_preferred_supplier",  input).then(r => wrapStage("evaluate_preferred_supplier",  r));
export async function applyDynamicCategoryRulesCall(input: RequestData): Promise<RequestDataPatch> {
  const raw = await fetchApi("/api/apply_dynamic_category_rules", input) as NodeResult & {
    eligible_suppliers?: EligibleSupplier[];
    request_interpretation?: Partial<RequestInterpretation>;
  };
  return {
    ...(raw.eligible_suppliers !== undefined ? { eligible_suppliers: raw.eligible_suppliers } : {}),
    ...(raw.request_interpretation ? { request_interpretation: raw.request_interpretation } : {}),
    ...wrapStage("apply_dynamic_category_rules", raw),
  };
}
export async function pricingCalculationCall(input: RequestData): Promise<RequestDataPatch> {
  const raw = await fetchApi("/api/pricing_calculation", input) as NodeResult & {
    supplier_shortlist?: RequestData["supplier_shortlist"];
  };
  return {
    ...(raw.supplier_shortlist ? { supplier_shortlist: raw.supplier_shortlist } : {}),
    ...wrapStage("pricing_calculation", raw),
  };
}
export async function reevaluateTierCall(input: RequestData): Promise<RequestDataPatch> {
  const raw = await fetchApi("/api/reevaluate_tier_from_quote", input) as NodeResult & { approval_tier?: ApprovalTier };
  return {
    ...(raw.approval_tier ? { approval_tier: raw.approval_tier } : {}),
    ...wrapStage("reevaluate_tier_from_quote", raw),
  };
}
export async function scoringAndRankingCall(input: RequestData): Promise<RequestDataPatch> {
  const raw = await fetchApi("/api/scoring_and_ranking", input) as NodeResult & {
    supplier_shortlist?: RequestData["supplier_shortlist"];
  };
  return {
    ...(raw.supplier_shortlist ? { supplier_shortlist: raw.supplier_shortlist } : {}),
    ...wrapStage("scoring_and_ranking", raw),
  };
}
export async function finalCheckCall(input: RequestData): Promise<RequestDataPatch> {
  const raw = await fetchApi("/api/final_check", input) as NodeResult & {
    recommendation?: RequestData["recommendation"];
    audit_trail?: RequestData["audit_trail"];
  };
  return {
    ...(raw.recommendation ? { recommendation: raw.recommendation } : {}),
    ...(raw.audit_trail    ? { audit_trail:    raw.audit_trail    } : {}),
    ...wrapStage("final_check", raw),
  };
}
