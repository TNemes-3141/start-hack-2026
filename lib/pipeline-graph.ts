import type { RequestDataPatch, StageId } from "@/lib/request-data";

export type PipelineNodeStatus = "outstanding" | "working" | "warning" | "escalation" | "done";
export type NodeStatuses = Record<string, PipelineNodeStatus>;

export const INITIAL_STATUSES: NodeStatuses = {
  "request-submitted":         "outstanding",
  "translation":               "outstanding",
  "internal-coherence":        "outstanding",
  "missing-required-data":     "outstanding",
  "check-available-products":  "outstanding",
  "inappropriate-requests":    "outstanding",
  "apply-cat-rules-1":         "outstanding",
  "approval-tier":             "outstanding",
  "precedence-lookup":         "outstanding",
  "purely-eligible-suppliers":   "outstanding",
  "restricted-suppliers":        "outstanding",
  "geographical-rules":          "outstanding",
  "evaluate-preferred-supplier": "outstanding",
  "apply-cat-rules-2":           "outstanding",
  "pricing-calculation":       "outstanding",
  "re-evaluate-tier":          "outstanding",
  "scoring-ranking":           "outstanding",
  "final-check":               "outstanding",
  "done":                      "outstanding",
};

// Maps the node name passed to namedUpdate() → graph node ID in INITIAL_STATUSES
export const NODE_NAME_TO_GRAPH_ID: Record<string, string> = {
  translation:                  "translation",
  internal_coherence:           "internal-coherence",
  missing_required_data:        "missing-required-data",
  check_available_products:     "check-available-products",
  inappropriate_requests:       "inappropriate-requests",
  apply_category_rules:         "apply-cat-rules-1",
  precedence_lookup:            "precedence-lookup",
  approval_tier:                "approval-tier",
  purely_eligible_suppliers:    "purely-eligible-suppliers",
  restricted_suppliers:         "restricted-suppliers",
  geographical_rules:           "geographical-rules",
  evaluate_preferred_supplier:  "evaluate-preferred-supplier",
  apply_dynamic_category_rules: "apply-cat-rules-2",
  pricing_calculation:          "pricing-calculation",
  reevaluate_tier_from_quote:   "re-evaluate-tier",
  scoring_and_ranking:          "scoring-ranking",
  final_check:                  "final-check",
};

// Graph successors: when a node reaches a terminal status, advance these next nodes to "working"
export const SUCCESSORS: Record<string, string[]> = {
  "request-submitted":         ["translation", "internal-coherence"],
  "translation":               ["inappropriate-requests"],
  "internal-coherence":        ["missing-required-data"],
  "missing-required-data":     ["check-available-products"],
  "check-available-products":  ["inappropriate-requests"],
  "inappropriate-requests":    ["apply-cat-rules-1", "precedence-lookup"],
  "apply-cat-rules-1":         ["purely-eligible-suppliers"],
  "precedence-lookup":         ["approval-tier"],
  "approval-tier":             ["purely-eligible-suppliers"],
  "purely-eligible-suppliers":   ["restricted-suppliers", "evaluate-preferred-supplier"],
  "restricted-suppliers":        ["geographical-rules"],
  "geographical-rules":          ["apply-cat-rules-2"],
  "evaluate-preferred-supplier": ["apply-cat-rules-2"],
  "apply-cat-rules-2":           ["pricing-calculation"],
  "pricing-calculation":       ["re-evaluate-tier"],
  "re-evaluate-tier":          ["scoring-ranking"],
  "scoring-ranking":           ["final-check"],
  "final-check":               ["done"],
};

// Fan-in nodes: ALL listed predecessors must be terminal before the node advances to "working"
export const REQUIRED_PREDECESSORS: Partial<Record<string, string[]>> = {
  "inappropriate-requests":    ["translation", "check-available-products"],
  "purely-eligible-suppliers": ["apply-cat-rules-1", "approval-tier"],
  "apply-cat-rules-2":         ["geographical-rules", "evaluate-preferred-supplier"],
};

export const TERMINAL_STATUSES = new Set<PipelineNodeStatus>(["done", "warning", "escalation"]);

// After updating a node to a terminal status, set immediate successors to "working"
// (if all their required predecessors are also terminal)
export function propagateWorking(statuses: NodeStatuses, updatedId: string): NodeStatuses {
  const next = { ...statuses };
  for (const successor of (SUCCESSORS[updatedId] ?? [])) {
    if (next[successor] !== "outstanding") continue;
    const required = REQUIRED_PREDECESSORS[successor];
    if (required) {
      // All required predecessors must be terminal …
      if (!required.every((p) => TERMINAL_STATUSES.has(next[p]))) continue;
      // … but none of them may be blocked (escalation propagates the block, not work)
      if (required.some((p) => next[p] === "escalation")) continue;
    }
    next[successor] = "working";
  }
  return next;
}

export function deriveStatus(nodeName: string, patch: RequestDataPatch): PipelineNodeStatus {
  const stageResult = patch.stages?.[nodeName as StageId];
  const hasBlocking =
    stageResult?.escalations?.some((e) => e.blocking) ||
    stageResult?.issues?.some((i) => i.blocking);
  const hasWarning =
    (stageResult?.escalations?.length ?? 0) > 0 ||
    (stageResult?.issues?.length ?? 0) > 0;

  if (hasBlocking) return "escalation";
  if (hasWarning)  return "warning";
  return "done";
}
