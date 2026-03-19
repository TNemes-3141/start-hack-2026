"use client";

import { createContext, useContext, useState } from "react";
import { createRequestData, mergeRequestData, type RequestData, type RequestInterpretation } from "@/lib/request-data";
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

const NODE_NAME_TO_GRAPH_ID: Record<string, string> = {
  translate:                "translation",
  internal_coherence:       "internal-coherence",
  missing_required_data:    "missing-required-data",
  check_available_products: "check-available-product",
};

function deriveStatus(nodeName: string, patch: Partial<RequestData>): PipelineNodeStatus {
  const escalations = patch.escalations ?? [];
  if (nodeName === "translate") return "done";
  if (nodeName === "missing_required_data") return escalations.length > 0 ? "warning" : "done";
  return escalations.length > 0 ? "escalation" : "done";
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
      "request-submitted":       "done",
      "translation":             "working",
      "internal-coherence":      "working",
      "missing-required-data":   "working",
      "check-available-product": "working",
    });
    setIsPipelineRunning(true);

    void core_agent(form, (nodeName, patch) => {
      setRequestData((prev) => mergeRequestData(prev, patch));
      const graphId = NODE_NAME_TO_GRAPH_ID[nodeName];
      if (graphId) {
        const status = deriveStatus(nodeName, patch);
        setNodeStatuses((prev) => ({ ...prev, [graphId]: status }));
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
