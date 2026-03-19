export type RequestData = {
  request_id: string;
  processed_at: string;
  request_interpretation: unknown;
  validation: {
    completeness: string;
    issues_detected: { issue_id: string; severity: string; type: string; description: string; action_required: string }[];
  };
  policy_evaluation: {
    approval_threshold: { rule_applied: string; basis: string; quotes_required: number; approvers: string[]; deviation_approval: string; note: string };
    preferred_supplier: { supplier: string; status: string; is_preferred: boolean; covers_delivery_country: boolean; is_restricted: boolean; policy_note: string };
    restricted_suppliers: Record<string, { restricted: boolean; note: string }>;
    category_rules_applied: string[];
    geography_rules_applied: string[];
  };
  supplier_shortlist: {
    rank: number; supplier_id: string; supplier_name: string; preferred: boolean; incumbent: boolean;
    pricing_tier_applied: string; unit_price_eur: number; total_price_eur: number;
    standard_lead_time_days: number; expedited_lead_time_days: number;
    expedited_unit_price_eur: number; expedited_total_eur: number;
    quality_score: number; risk_score: number; esg_score: number;
    policy_compliant: boolean; covers_delivery_country: boolean; recommendation_note: string;
  }[];
  suppliers_excluded: { supplier_id: string; supplier_name: string; reason: string }[];
  issues: { issue_id: string; trigger: string; escalate_to: string; blocking: boolean }[];
  escalations: { escalation_id: string; rule: string; trigger: string; escalate_to: string; blocking: boolean }[];
  reasonings: { step_id: string; aspect: string; reasoning: string }[];
  policy_violations: { policy: string; description?: string }[];
  recommendation: { status: string; reason: string; preferred_supplier_if_resolved: string; preferred_supplier_rationale: string; minimum_budget_required: number; minimum_budget_currency: string };
  audit_trail: { policies_checked: string[]; supplier_ids_evaluated: string[]; pricing_tiers_applied: string; data_sources_used: string[]; historical_awards_consulted: boolean; historical_award_note: string };
};

export function createRequestData(requestInterpretation: unknown = null): RequestData {
  return {
    request_id: "",
    processed_at: "",
    request_interpretation: requestInterpretation,
    validation: { completeness: "", issues_detected: [] },
    policy_evaluation: {
      approval_threshold: { rule_applied: "", basis: "", quotes_required: 0, approvers: [], deviation_approval: "", note: "" },
      preferred_supplier: { supplier: "", status: "", is_preferred: false, covers_delivery_country: false, is_restricted: false, policy_note: "" },
      restricted_suppliers: {},
      category_rules_applied: [],
      geography_rules_applied: [],
    },
    supplier_shortlist: [],
    suppliers_excluded: [],
    issues: [],
    escalations: [],
    reasonings: [],
    policy_violations: [],
    recommendation: { status: "", reason: "", preferred_supplier_if_resolved: "", preferred_supplier_rationale: "", minimum_budget_required: 0, minimum_budget_currency: "" },
    audit_trail: { policies_checked: [], supplier_ids_evaluated: [], pricing_tiers_applied: "", data_sources_used: [], historical_awards_consulted: false, historical_award_note: "" },
  };
}

/** Merges a partial patch into RequestData. Arrays are appended; primitives are overwritten. */
export function mergeRequestData(prev: RequestData, patch: Partial<RequestData>): RequestData {
  const next = { ...prev };
  for (const _key of Object.keys(patch)) {
    const key = _key as keyof RequestData;
    const val = patch[key];
    if (Array.isArray(next[key]) && Array.isArray(val)) {
      (next[key] as unknown[]) = [...(next[key] as unknown[]), ...val];
    } else if (val !== undefined) {
      (next[key] as unknown) = val;
    }
  }
  return next;
}
