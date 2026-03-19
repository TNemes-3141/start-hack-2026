"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { core_agent } from "@/lib/core-agent";
import {
  createRequestData,
  mergeRequestData,
  type RequestData,
  type RequestDataPatch,
  type RequestInterpretation,
} from "@/lib/request-data";
import {
  INITIAL_STATUSES,
  NODE_NAME_TO_GRAPH_ID,
  deriveStatus,
  propagateWorking,
  type NodeStatuses,
} from "@/lib/pipeline-graph";

const CLIENT_ID: string = uuidv4();
const HEARTBEAT_INTERVAL_MS = 10_000;

export type OrchestratorMode = "owner" | "observer" | "idle";

export type RAGOrchestratorState = {
  runId: string | null;
  requestData: RequestData;
  nodeStatuses: NodeStatuses;
  isPipelineRunning: boolean;
  mode: OrchestratorMode;
  startPipeline: (form: RequestInterpretation) => Promise<string>;
};

type RunRow = {
  id: string;
  status: string;
  context_payload: RequestData;
  node_statuses: NodeStatuses;
  active_client_id: string | null;
  last_heartbeat_at: string | null;
};

export function useRAGOrchestrator(): RAGOrchestratorState {
  const [runId, setRunId]                         = useState<string | null>(null);
  const [requestData, setRequestData]             = useState<RequestData>(createRequestData());
  const [nodeStatuses, setNodeStatuses]           = useState<NodeStatuses>(INITIAL_STATUSES);
  const [isPipelineRunning, setIsPipelineRunning] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function restHeaders() {
    return {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!}`,
      "Content-Type": "application/json",
    };
  }

  async function patchRun(id: string, patch: Record<string, unknown>) {
    await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rag_pipeline_runs?id=eq.${id}`,
      { method: "PATCH", headers: restHeaders(), body: JSON.stringify(patch) },
    );
  }

  function startHeartbeat(id: string) {
    stopHeartbeat();
    heartbeatRef.current = setInterval(() => {
      void patchRun(id, { last_heartbeat_at: new Date().toISOString() });
    }, HEARTBEAT_INTERVAL_MS);
  }

  function stopHeartbeat() {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
  }

  function applyRunToLocalState(run: Pick<RunRow, "context_payload" | "node_statuses">) {
    setRequestData(run.context_payload ?? createRequestData());
    setNodeStatuses(run.node_statuses ?? INITIAL_STATUSES);
  }

  // Restore state from the most recent in-progress run on mount
  useEffect(() => {
    async function init() {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rag_pipeline_runs` +
        `?status=neq.done&status=neq.aborted&order=created_at.desc&limit=1`,
        { headers: restHeaders() },
      );
      const rows: RunRow[] = await res.json();
      if (!rows[0]) return;
      setRunId(rows[0].id);
      applyRunToLocalState(rows[0]);
    }
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep local state in sync via Realtime while a run is active
  useEffect(() => {
    if (!runId) return;
    const channel = supabaseBrowser
      .channel(`rag_run:${runId}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "rag_pipeline_runs", filter: `id=eq.${runId}`,
      }, (payload) => {
        const updated = payload.new as RunRow;
        applyRunToLocalState(updated);
        if (updated.status === "done" || updated.status === "aborted") {
          setIsPipelineRunning(false);
          stopHeartbeat();
        }
      })
      .subscribe();
    return () => { void supabaseBrowser.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  useEffect(() => () => stopHeartbeat(), []);

  const startPipeline = useCallback(async (form: RequestInterpretation): Promise<string> => {
    const initData = createRequestData(form);
    const initNodeStatuses: NodeStatuses = {
      ...INITIAL_STATUSES,
      "request-submitted": "done",
      "translation":        "working",
      "internal-coherence": "working",
    };

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rag_pipeline_runs`,
      {
        method: "POST",
        headers: { ...restHeaders(), Prefer: "return=representation" },
        body: JSON.stringify({
          status: "group1_active",
          context_payload: initData,
          node_statuses: initNodeStatuses,
          active_client_id: CLIENT_ID,
          last_heartbeat_at: new Date().toISOString(),
        }),
      },
    );
    const [row]: RunRow[] = await res.json();
    const id = row.id;

    setRunId(id);
    setRequestData(initData);
    setNodeStatuses(initNodeStatuses);
    setIsPipelineRunning(true);
    startHeartbeat(id);

    await core_agent(form, async (nodeName, patch) => {
      setRequestData((prev) => {
        const next = mergeRequestData(prev, patch);
        const graphId = NODE_NAME_TO_GRAPH_ID[nodeName];
        setNodeStatuses((prevNS) => {
          const withUpdate = graphId ? { ...prevNS, [graphId]: deriveStatus(nodeName, patch) } : prevNS;
          const propagated = graphId ? propagateWorking(withUpdate, graphId) : withUpdate;
          void patchRun(id, {
            context_payload: next,
            node_statuses: propagated,
            status: `${nodeName}_complete`,
            last_heartbeat_at: new Date().toISOString(),
          });
          return propagated;
        });
        return next;
      });
    });

    await patchRun(id, { status: "done", last_heartbeat_at: new Date().toISOString() });
    setIsPipelineRunning(false);
    stopHeartbeat();
    return id;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { runId, requestData, nodeStatuses, isPipelineRunning, mode: "owner", startPipeline };
}
