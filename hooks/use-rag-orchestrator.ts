"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { core_agent } from "@/lib/core-agent";
import {
  createRequestData,
  mergeRequestData,
  type RequestData,
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
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

export type OrchestratorMode = "owner" | "observer" | "idle";

export type RAGOrchestratorState = {
  runId: string | null;
  requestData: RequestData;
  nodeStatuses: NodeStatuses;
  isPipelineRunning: boolean;
  mode: OrchestratorMode;
  startPipeline: (form: RequestInterpretation) => Promise<string>;
  approveAndResume: (existingRunId: string, existingData: RequestData, approvedByLabel: string) => Promise<void>;
};

type RunRow = {
  id: string;
  status: string;
  context_payload: RequestData;
  node_statuses: NodeStatuses;
  active_client_id: string | null;
  last_heartbeat_at: string | null;
};

function makeHeaders(withContentType = false): Record<string, string> {
  const h: Record<string, string> = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
  if (withContentType) h["Content-Type"] = "application/json";
  return h;
}

async function patchRun(id: string, patch: Record<string, unknown>) {
  await fetch(`${SUPABASE_URL}/rest/v1/rag_pipeline_runs?id=eq.${id}`, {
    method: "PATCH",
    headers: makeHeaders(true),
    body: JSON.stringify(patch),
  });
}

export function useRAGOrchestrator(): RAGOrchestratorState {
  const [runId, setRunId]                         = useState<string | null>(null);
  const [requestData, setRequestData]             = useState<RequestData>(createRequestData());
  const [nodeStatuses, setNodeStatuses]           = useState<NodeStatuses>(INITIAL_STATUSES);
  const [isPipelineRunning, setIsPipelineRunning] = useState(false);

  // Refs hold the authoritative values during pipeline execution.
  // Using refs avoids stale-closure issues in async callbacks and means
  // we never need setState updater functions — no nested setState.
  const dataRef      = useRef<RequestData>(createRequestData());
  const statusesRef  = useRef<NodeStatuses>(INITIAL_STATUSES);
  // While core_agent is running, we suppress our own Realtime echoes.
  const isRunningRef = useRef(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Heartbeat ──────────────────────────────────────────────────────────────

  function startHeartbeat(id: string) {
    stopHeartbeat();
    heartbeatRef.current = setInterval(
      () => void patchRun(id, { last_heartbeat_at: new Date().toISOString() }),
      HEARTBEAT_INTERVAL_MS,
    );
  }
  function stopHeartbeat() {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
  }

  // ── Apply a DB row to both refs and React state ────────────────────────────

  function applyRunRow(run: Pick<RunRow, "context_payload" | "node_statuses">) {
    const data     = run.context_payload ?? createRequestData();
    const statuses = run.node_statuses   ?? INITIAL_STATUSES;
    dataRef.current     = data;
    statusesRef.current = statuses;
    setRequestData(data);
    setNodeStatuses(statuses);
  }

  // ── On mount: restore the most recent in-progress run ─────────────────────

  useEffect(() => {
    async function init() {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/rag_pipeline_runs` +
        `?status=neq.done&status=neq.aborted&order=created_at.desc&limit=1`,
        { headers: makeHeaders() },
      );
      const rows: RunRow[] = await res.json();
      if (!rows[0]) return;
      setRunId(rows[0].id);
      applyRunRow(rows[0]);
    }
    void init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime: sync state from DB, but skip echoes of our own writes ────────

  useEffect(() => {
    if (!runId) return;
    const channel = supabaseBrowser
      .channel(`rag_run:${runId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rag_pipeline_runs", filter: `id=eq.${runId}` },
        (payload) => {
          // While we are the one writing every node result, skip the echo.
          // This prevents a double-render ~150 ms after every local update.
          if (isRunningRef.current) return;
          const updated = payload.new as RunRow;
          applyRunRow(updated);
          if (updated.status === "done" || updated.status === "aborted") {
            setIsPipelineRunning(false);
            stopHeartbeat();
          }
        },
      )
      .subscribe();
    return () => { void supabaseBrowser.removeChannel(channel); };
  }, [runId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => stopHeartbeat(), []);

  // ── Start a new pipeline run ───────────────────────────────────────────────

  const startPipeline = useCallback(async (form: RequestInterpretation): Promise<string> => {
    const initData: RequestData  = createRequestData(form);
    const initStatuses: NodeStatuses = {
      ...INITIAL_STATUSES,
      "request-submitted": "done",
      "translation":        "working",
      "internal-coherence": "working",
    };

    // 1. Create the DB row. This is the only awaited step before returning.
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rag_pipeline_runs`, {
      method: "POST",
      headers: { ...makeHeaders(true), Prefer: "return=representation" },
      body: JSON.stringify({
        status: "group1_active",
        context_payload: initData,
        node_statuses: initStatuses,
        active_client_id: CLIENT_ID,
        last_heartbeat_at: new Date().toISOString(),
      }),
    });
    const [row]: RunRow[] = await res.json();
    const id = row.id;

    // 2. Sync refs and React state.
    dataRef.current     = initData;
    statusesRef.current = initStatuses;
    setRunId(id);
    setRequestData(initData);
    setNodeStatuses(initStatuses);
    setIsPipelineRunning(true);
    startHeartbeat(id);

    // 3. Run the pipeline in the background — do NOT await, return id immediately.
    void runPipeline(id, form);

    return id; // Caller gets the ID right after INSERT, not after the pipeline.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Internal pipeline executor (reusable for approve-and-resume) ───────────

  const runPipeline = useCallback(async (id: string, form: RequestInterpretation) => {
    isRunningRef.current = true;
    try {
      await core_agent(form, (nodeName, patch) => {
        // Compute next state from refs — synchronous, no stale closures.
        const nextData    = mergeRequestData(dataRef.current, patch);
        const graphId     = NODE_NAME_TO_GRAPH_ID[nodeName];
        const nodeStatus  = graphId ? deriveStatus(nodeName, patch) : undefined;
        const withUpdate  = graphId
          ? { ...statusesRef.current, [graphId]: nodeStatus! }
          : statusesRef.current;
        // Only propagate "working" to successors when node is NOT blocking.
        const nextStatuses = (graphId && nodeStatus !== "escalation")
          ? propagateWorking(withUpdate, graphId)
          : withUpdate;

        dataRef.current     = nextData;
        statusesRef.current = nextStatuses;

        setRequestData(nextData);
        setNodeStatuses(nextStatuses);

        void patchRun(id, {
          context_payload:   nextData,
          node_statuses:     nextStatuses,
          status:            `${nodeName}_complete`,
          last_heartbeat_at: new Date().toISOString(),
        });
      });
    } finally {
      isRunningRef.current = false;
      // Detect if pipeline aborted due to a blocking issue in any stage.
      const isBlocked = Object.values(dataRef.current.stages).some(
        (s) => s.escalations?.some((e) => e.blocking) || s.issues?.some((i) => i.blocking),
      );
      const finalStatuses: NodeStatuses = isBlocked
        ? statusesRef.current
        : { ...statusesRef.current, "done": "done" };
      statusesRef.current = finalStatuses;
      setNodeStatuses(finalStatuses);
      void patchRun(id, {
        status:            isBlocked ? "blocked" : "done",
        node_statuses:     finalStatuses,
        last_heartbeat_at: new Date().toISOString(),
      });
      setIsPipelineRunning(false);
      stopHeartbeat();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Approve a blocked run and re-run the pipeline ─────────────────────────

  const approveAndResume = useCallback(async (
    existingRunId: string,
    existingData: RequestData,
    approvedByLabel: string,
  ): Promise<void> => {
    const approvalNote = `Approved by ${approvedByLabel} on ${new Date().toISOString().slice(0, 10)}`;
    const updatedInterp: RequestInterpretation = {
      ...existingData.request_interpretation,
      requester_instruction: approvalNote,
    };
    const initData: RequestData = createRequestData(updatedInterp);
    const initStatuses: NodeStatuses = {
      ...INITIAL_STATUSES,
      "request-submitted": "done",
      "translation":        "working",
      "internal-coherence": "working",
    };

    // Reset the existing DB row and re-use it.
    await patchRun(existingRunId, {
      status:            "group1_active",
      context_payload:   initData,
      node_statuses:     initStatuses,
      active_client_id:  CLIENT_ID,
      last_heartbeat_at: new Date().toISOString(),
    });

    dataRef.current     = initData;
    statusesRef.current = initStatuses;
    setRunId(existingRunId);
    setRequestData(initData);
    setNodeStatuses(initStatuses);
    setIsPipelineRunning(true);
    startHeartbeat(existingRunId);

    void runPipeline(existingRunId, updatedInterp);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { runId, requestData, nodeStatuses, isPipelineRunning, mode: "owner", startPipeline, approveAndResume };
}
