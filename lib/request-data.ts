// ── Shared sub-types ──────────────────────────────────────────────────────────

export type Issue = {
  issue_id: string;
  trigger: string;
  escalate_to: string;
  blocking: boolean;
};

export type Escalation = {
  escalation_id: string;
  rule: string;
  trigger: string;
  escalate_to: string;
  blocking: boolean;
};

export type Reasoning = {
  step_id: string;
  aspect: string;
  reasoning: string;
};

export type PolicyEvaluation = {
  policy: string;
  description?: string;
};

export type NodeResult = {
  issues: Issue[];
  escalations: Escalation[];
  reasonings: Reasoning[];
  policy_violations: PolicyEvaluation[];
};

// ── Stage IDs ─────────────────────────────────────────────────────────────────

export type StageId =
  | "translation"
  | "internal_coherence"
  | "missing_required_data"
  | "check_available_products"
  | "inappropriate_requests"
  | "apply_category_rules"
  | "approval_tier"
  | "precedence_lookup"
  | "purely_eligible_suppliers"
  | "restricted_suppliers"
  | "check_eligible_suppliers"
  | "pricing_calculation"
  | "reevaluate_tier_from_quote"
  | "scoring_and_ranking";

export type Stages = Record<StageId, NodeResult>;

// ── RequestInterpretation ─────────────────────────────────────────────────────

export type RequestInterpretation = {
  // Form fields (match example_request.json)
  request_language?: string;
  business_unit?: string;
  country?: string;
  city?: string;
  requester_id?: string;
  requester_role?: string;
  category_l1?: string;
  category_l2?: string;
  title?: string;
  request_text?: string;
  currency?: string;
  budget_amount?: number;
  quantity?: number;
  unit_of_measure?: string;
  required_by_date?: string;
  preferred_supplier_mentioned?: string;
  incumbent_supplier?: string;
  contract_type_requested?: string;
  delivery_countries?: string[];
  esg_requirement?: boolean;
  // Pipeline-computed fields
  days_until_required?: number;
  data_residency_required?: boolean;
  data_residency_constraint?: boolean;
  requester_instruction?: string;
  [key: string]: unknown;
};

export const FIELD_LABELS: Record<string, string> = {
  request_language: "Request Language",
  business_unit: "Business Unit",
  country: "Country",
  city: "City",
  requester_id: "Requester ID",
  requester_role: "Requester Role",
  category_l1: "Category (L1)",
  category_l2: "Category (L2)",
  title: "Request Title",
  request_text: "Request Details",
  currency: "Currency",
  budget_amount: "Budget Amount",
  quantity: "Quantity",
  unit_of_measure: "Unit of Measure",
  required_by_date: "Required By Date",
  preferred_supplier_mentioned: "Preferred Supplier Mentioned",
  incumbent_supplier: "Incumbent Supplier",
  contract_type_requested: "Contract Type Requested",
  delivery_countries: "Delivery Countries",
  esg_requirement: "ESG Requirement",
};

// ── RequestData ───────────────────────────────────────────────────────────────

export type RequestData = {
  request_id: string;
  processed_at: string;
  request_interpretation: RequestInterpretation;
  stages: Stages;
  supplier_shortlist: {
    rank: number; supplier_id: string; supplier_name: string; preferred: boolean; incumbent: boolean;
    pricing_tier_applied: string; unit_price_eur: number; total_price_eur: number;
    standard_lead_time_days: number; expedited_lead_time_days: number;
    expedited_unit_price_eur: number; expedited_total_eur: number;
    quality_score: number; risk_score: number; esg_score: number;
    policy_compliant: boolean; covers_delivery_country: boolean; recommendation_note: string;
  }[];
  suppliers_excluded: { supplier_id: string; supplier_name: string; reason: string }[];
  recommendation: { status: string; reason: string; preferred_supplier_if_resolved: string; preferred_supplier_rationale: string; minimum_budget_required: number; minimum_budget_currency: string };
  audit_trail: { policies_checked: string[]; supplier_ids_evaluated: string[]; pricing_tiers_applied: string; data_sources_used: string[]; historical_awards_consulted: boolean; historical_award_note: string };
};

// Patch type: stages is partial so a single node can update just its own slot
export type RequestDataPatch = Omit<Partial<RequestData>, "stages"> & {
  stages?: Partial<Record<StageId, Partial<NodeResult>>>;
};

// ── Factories ─────────────────────────────────────────────────────────────────

function emptyNodeResult(): NodeResult {
  return { issues: [], escalations: [], reasonings: [], policy_violations: [] };
}

function emptyStages(): Stages {
  return {
    translation: emptyNodeResult(),
    internal_coherence: emptyNodeResult(),
    missing_required_data: emptyNodeResult(),
    check_available_products: emptyNodeResult(),
    inappropriate_requests: emptyNodeResult(),
    apply_category_rules: emptyNodeResult(),
    approval_tier: emptyNodeResult(),
    precedence_lookup: emptyNodeResult(),
    purely_eligible_suppliers: emptyNodeResult(),
    restricted_suppliers: emptyNodeResult(),
    check_eligible_suppliers: emptyNodeResult(),
    pricing_calculation: emptyNodeResult(),
    reevaluate_tier_from_quote: emptyNodeResult(),
    scoring_and_ranking: emptyNodeResult(),
  };
}

export function createRequestData(requestInterpretation: RequestInterpretation = {}): RequestData {
  return {
    request_id: "",
    processed_at: "",
    request_interpretation: requestInterpretation,
    stages: emptyStages(),
    supplier_shortlist: [],
    suppliers_excluded: [],
    recommendation: { status: "", reason: "", preferred_supplier_if_resolved: "", preferred_supplier_rationale: "", minimum_budget_required: 0, minimum_budget_currency: "" },
    audit_trail: { policies_checked: [], supplier_ids_evaluated: [], pricing_tiers_applied: "", data_sources_used: [], historical_awards_consulted: false, historical_award_note: "" },
  };
}

// ── Merge ─────────────────────────────────────────────────────────────────────

function appendNodeResult(prev: NodeResult, patch: Partial<NodeResult>): NodeResult {
  return {
    issues: [...prev.issues, ...(patch.issues ?? [])],
    escalations: [...prev.escalations, ...(patch.escalations ?? [])],
    reasonings: [...prev.reasonings, ...(patch.reasonings ?? [])],
    policy_violations: [...prev.policy_violations, ...(patch.policy_violations ?? [])],
  };
}

export function mergeRequestData(prev: RequestData, patch: RequestDataPatch): RequestData {
  const next: RequestData = { ...prev };

  // Merge stages: append arrays into the specific stage slot
  if (patch.stages) {
    next.stages = { ...prev.stages };
    for (const _id of Object.keys(patch.stages) as StageId[]) {
      const stagePatch = patch.stages[_id]!;
      next.stages[_id] = appendNodeResult(prev.stages[_id], stagePatch);
      console.log(
        `[RequestData] stages.${_id} ←`,
        `${stagePatch.issues?.length ?? 0} issue(s),`,
        `${stagePatch.escalations?.length ?? 0} escalation(s),`,
        `${stagePatch.reasonings?.length ?? 0} reasoning(s),`,
        `${stagePatch.policy_violations?.length ?? 0} policy_violation(s)`,
      );
      if (stagePatch.issues?.length)          console.log(`  issues:`,          stagePatch.issues);
      if (stagePatch.escalations?.length)     console.log(`  escalations:`,     stagePatch.escalations);
      if (stagePatch.policy_violations?.length) console.log(`  policy_violations:`, stagePatch.policy_violations);
    }
  }

  // Merge request_interpretation: shallow-merge so individual fields don't wipe siblings
  if (patch.request_interpretation) {
    next.request_interpretation = { ...prev.request_interpretation, ...patch.request_interpretation };
    const changed = Object.keys(patch.request_interpretation);
    console.log(`[RequestData] request_interpretation ← updated fields:`, changed);
  }

  // Remaining top-level fields: arrays append, primitives overwrite
  const skip = new Set(["stages", "request_interpretation"]);
  for (const _key of Object.keys(patch)) {
    if (skip.has(_key)) continue;
    const key = _key as keyof Omit<RequestData, "stages" | "request_interpretation">;
    const val = (patch as Record<string, unknown>)[key];
    if (Array.isArray((next as Record<string, unknown>)[key]) && Array.isArray(val)) {
      (next as Record<string, unknown>)[key] = [...(next as Record<string, unknown>)[key] as unknown[], ...val];
    } else if (val !== undefined) {
      (next as Record<string, unknown>)[key] = val;
    }
  }

  return next;
}
