"use client";

import { createContext, useContext, useState } from "react";
import { createRequestData, mergeRequestData, type RequestData, type RequestDataPatch, type RequestInterpretation, type StageId } from "@/lib/request-data";
import { core_agent } from "@/lib/core-agent";

export type PipelineNodeStatus = "outstanding" | "working" | "warning" | "escalation" | "done";

export type NodeStatuses = Record<string, PipelineNodeStatus>;

type RequestStore = {
  requestData: RequestData;
  nodeStatuses: NodeStatuses;
  isPipelineRunning: boolean;
  startPipeline: (form: RequestInterpretation) => void;
};

const INITIAL_STATUSES: NodeStatuses = {
  "request-submitted":         "outstanding",
  "translation":               "outstanding",
  "internal-coherence":        "outstanding",
  "missing-required-data":     "outstanding",
  "check-available-products":  "outstanding",
  "inappropriate-requests":    "outstanding",
  "apply-cat-rules-1":         "outstanding",
  "approval-tier":             "outstanding",
  "precedence-lookup":         "outstanding",
  "purely-eligible-suppliers": "outstanding",
  "restricted-suppliers":      "outstanding",
  "check-eligible-supplier":   "outstanding",
  "apply-cat-rules-2":         "outstanding",
  "pricing-calculation":       "outstanding",
  "re-evaluate-tier":          "outstanding",
  "scoring-ranking":           "outstanding",
  "final-check":               "outstanding",
  "done":                      "outstanding",
};

// Maps the node name passed to namedUpdate() → graph node ID in INITIAL_STATUSES
const NODE_NAME_TO_GRAPH_ID: Record<string, string> = {
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
  check_eligible_suppliers:     "check-eligible-supplier",
  apply_category_rules_2:       "apply-cat-rules-2",
  pricing_calculation:          "pricing-calculation",
  reevaluate_tier_from_quote:   "re-evaluate-tier",
  scoring_and_ranking:          "scoring-ranking",
  final_check:                  "final-check",
};

// Graph successors: when a node reaches a terminal status, advance these next nodes to "working"
const SUCCESSORS: Record<string, string[]> = {
  "request-submitted":         ["translation", "internal-coherence"],
  "translation":               ["inappropriate-requests"],
  "internal-coherence":        ["missing-required-data"],
  "missing-required-data":     ["check-available-products"],
  "check-available-products":  ["inappropriate-requests"],
  "inappropriate-requests":    ["apply-cat-rules-1", "precedence-lookup"],
  "apply-cat-rules-1":         ["purely-eligible-suppliers"],
  "precedence-lookup":         ["approval-tier"],
  "approval-tier":             ["purely-eligible-suppliers"],
  "purely-eligible-suppliers": ["restricted-suppliers", "check-eligible-supplier"],
  "restricted-suppliers":      ["apply-cat-rules-2"],
  "check-eligible-supplier":   ["apply-cat-rules-2"],
  "apply-cat-rules-2":         ["pricing-calculation"],
  "pricing-calculation":       ["re-evaluate-tier"],
  "re-evaluate-tier":          ["scoring-ranking"],
  "scoring-ranking":           ["final-check"],
  "final-check":               ["done"],
};

// Fan-in nodes: ALL listed predecessors must be terminal before the node advances to "working"
const REQUIRED_PREDECESSORS: Partial<Record<string, string[]>> = {
  "inappropriate-requests":    ["translation", "check-available-products"],
  "purely-eligible-suppliers": ["apply-cat-rules-1", "approval-tier"],
  "apply-cat-rules-2":         ["restricted-suppliers", "check-eligible-supplier"],
};

const TERMINAL_STATUSES = new Set<PipelineNodeStatus>(["done", "warning", "escalation"]);

// After updating a node to a terminal status, set immediate successors to "working"
// (if all their required predecessors are also terminal)
function propagateWorking(statuses: NodeStatuses, updatedId: string): NodeStatuses {
  const next = { ...statuses };
  for (const successor of (SUCCESSORS[updatedId] ?? [])) {
    if (next[successor] !== "outstanding") continue;
    const required = REQUIRED_PREDECESSORS[successor];
    if (required && !required.every((p) => TERMINAL_STATUSES.has(next[p]))) continue;
    next[successor] = "working";
  }
  return next;
}

function deriveStatus(nodeName: string, patch: RequestDataPatch): PipelineNodeStatus {
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

const RequestStoreContext = createContext<RequestStore | null>(null);

export function RequestStoreProvider({ children }: { children: React.ReactNode }) {
  const [requestData, setRequestData] = useState<RequestData>(createRequestData());
  const [nodeStatuses, setNodeStatuses] = useState<NodeStatuses>(INITIAL_STATUSES);
  const [isPipelineRunning, setIsPipelineRunning] = useState(false);

  function startPipeline(form: RequestInterpretation) {
    setRequestData(createRequestData(form));
    setNodeStatuses({
      ...INITIAL_STATUSES,
      "request-submitted":   "done",
      // Group 1 starts immediately: translate + internalCoherence in parallel
      "translation":         "working",
      "internal-coherence":  "working",
    });
    setIsPipelineRunning(true);

    void core_agent(form, (nodeName, patch) => {
      setRequestData((prev) => mergeRequestData(prev, patch));
      const graphId = NODE_NAME_TO_GRAPH_ID[nodeName];
      if (graphId) {
        setNodeStatuses((prev) => {
          const withUpdate = { ...prev, [graphId]: deriveStatus(nodeName, patch) };
          return propagateWorking(withUpdate, graphId);
        });
      }
    }).finally(() => {
      setIsPipelineRunning(false);
      setNodeStatuses((prev) => prev["done"] === "working" ? { ...prev, "done": "done" } : prev);
    });
  }

  return (
    <RequestStoreContext.Provider value={{ requestData, nodeStatuses, isPipelineRunning, startPipeline }}>
      {children}
    </RequestStoreContext.Provider>
  );
}

export function useRequestStore() {
  const ctx = useContext(RequestStoreContext);
  if (!ctx) throw new Error("useRequestStore must be used within RequestStoreProvider");
  return ctx;
}
