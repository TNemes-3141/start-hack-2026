"use client";

import { createContext, useContext } from "react";
import { useRAGOrchestrator, type RAGOrchestratorState } from "@/hooks/use-rag-orchestrator";

// Re-export graph types so consumers don't need to change their imports
export type { PipelineNodeStatus, NodeStatuses } from "@/lib/pipeline-graph";

const RequestStoreContext = createContext<RAGOrchestratorState | null>(null);

export function RequestStoreProvider({ children }: { children: React.ReactNode }) {
  const orchestrator = useRAGOrchestrator();
  return (
    <RequestStoreContext.Provider value={orchestrator}>
      {children}
    </RequestStoreContext.Provider>
  );
}

export function useRequestStore() {
  const ctx = useContext(RequestStoreContext);
  if (!ctx) throw new Error("useRequestStore must be used within RequestStoreProvider");
  return ctx;
}
