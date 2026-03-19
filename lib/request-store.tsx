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
  "check-available-product":   "outstanding",
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
  translation:               "translation",
  internal_coherence:        "internal-coherence",
  missing_required_data:     "missing-required-data",
  check_available_products:  "check-available-product",
  inappropriate_requests:    "inappropriate-requests",
  apply_category_rules:      "apply-cat-rules-1",
  precedence_lookup:         "precedence-lookup",
  approval_tier:             "approval-tier",
  purely_eligible_suppliers: "purely-eligible-suppliers",
};

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
        setNodeStatuses((prev) => ({ ...prev, [graphId]: deriveStatus(nodeName, patch) }));
      }
    }).finally(() => setIsPipelineRunning(false));
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
