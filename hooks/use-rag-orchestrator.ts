// This file defines a React hook `useRAGOrchestrator` that manages the state and execution of a pipeline for processing requests.

"use client"; // Indicates that this file is a client-side module.

import { useEffect, useRef, useState, useCallback } from "react"; // React hooks for managing state and lifecycle.
import { v4 as uuidv4 } from "uuid"; // Generates unique IDs.
import { supabaseBrowser } from "@/lib/supabase-browser"; // Supabase client for interacting with the database.
import { core_agent } from "@/lib/core-agent"; // Core agent for executing pipeline stages.
import {
  createRequestData, // Utility to create initial request data.
  mergeRequestData, // Utility to merge updated request data.
  type RequestData, // Type definition for request data.
  type RequestInterpretation, // Type definition for request interpretation.
  type StageId, // Type definition for stage IDs.
} from "@/lib/request-data";
import {
  INITIAL_STATUSES, // Initial statuses for pipeline nodes.
  NODE_NAME_TO_GRAPH_ID, // Mapping of node names to graph IDs.
  TERMINAL_STATUSES, // Set of terminal statuses for pipeline nodes.
  deriveStatus, // Utility to derive the status of a node.
  propagateWorking, // Utility to propagate "working" status to successors.
  type NodeStatuses, // Type definition for node statuses.
  type PipelineNodeStatus, // Type definition for pipeline node status.
} from "@/lib/pipeline-graph";

// Constants for client ID, heartbeat interval, and Supabase configuration.
const CLIENT_ID: string = uuidv4();
const HEARTBEAT_INTERVAL_MS = 10_000;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

// Type definitions for orchestrator mode and state.
export type OrchestratorMode = "owner" | "observer" | "idle";
export type RAGOrchestratorState = {
  runId: string | null; // Current pipeline run ID.
  requestData: RequestData; // Current request data.
  nodeStatuses: NodeStatuses; // Current statuses of pipeline nodes.
  isPipelineRunning: boolean; // Whether the pipeline is running.
  mode: OrchestratorMode; // Mode of the orchestrator.
  startPipeline: (form: RequestInterpretation) => Promise<string>; // Function to start a new pipeline.
  approveAndResume: (existingRunId: string, existingData: RequestData, approvedByLabel: string) => Promise<void>; // Function to approve and resume a blocked pipeline.
  resolveIssue: (runId: string, data: RequestData, existingNodeStatuses: NodeStatuses, stageKey: string, issueId: string) => Promise<void>; // Function to resolve a blocking issue.
  acknowledgeItem: (runId: string, data: RequestData, stageKey: string, type: "issue" | "escalation", itemId: string) => Promise<void>; // Function to acknowledge an advisory item without resuming.
};

// Type definition for a database row representing a pipeline run.
type RunRow = {
  id: string; // Unique ID of the run.
  status: string; // Current status of the run.
  context_payload: RequestData; // Request data associated with the run.
  node_statuses: NodeStatuses; // Node statuses associated with the run.
  active_client_id: string | null; // ID of the active client.
  last_heartbeat_at: string | null; // Timestamp of the last heartbeat.
};

// Utility function to create headers for Supabase requests.
function makeHeaders(withContentType = false): Record<string, string> {
  const h: Record<string, string> = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
  if (withContentType) h["Content-Type"] = "application/json";
  return h;
}

// Utility function to update a pipeline run in the database.
async function patchRun(id: string, patch: Record<string, unknown>) {
  await fetch(`${SUPABASE_URL}/rest/v1/rag_pipeline_runs?id=eq.${id}`, {
    method: "PATCH",
    headers: makeHeaders(true),
    body: JSON.stringify(patch),
  });
}

/** Returns the set of core_agent stage names (e.g. "translation", "missing_required_data")
 *  that are already in a terminal state in the given graph node statuses. */
function computeCompletedStages(graphStatuses: NodeStatuses): Set<string> {
  const graphIdToStageName: Record<string, string> = Object.fromEntries(
    Object.entries(NODE_NAME_TO_GRAPH_ID).map(([stageName, graphId]) => [graphId, stageName]),
  );
  return new Set(
    Object.entries(graphStatuses)
      .filter(([, status]) => TERMINAL_STATUSES.has(status as PipelineNodeStatus))
      .map(([graphId]) => graphIdToStageName[graphId])
      .filter((name): name is string => name !== undefined),
  );
}

// Main hook that manages the pipeline orchestrator.
export function useRAGOrchestrator(): RAGOrchestratorState {
  // React state for run ID, request data, and node statuses.
  const [runId, setRunId]           = useState<string | null>(null);
  const [requestData, setRequestData] = useState<RequestData>(createRequestData());
  const [nodeStatuses, setNodeStatuses] = useState<NodeStatuses>(INITIAL_STATUSES);

  // Derived state to determine if the pipeline is blocked or done.
  const isBlocked = Object.values(requestData.stages).some(
    (s) => s.escalations?.some((e) => e.blocking) || s.issues?.some((i) => i.blocking),
  );
  const isDone = nodeStatuses["done"] === "done";
  const isPipelineRunning = runId !== null && !isBlocked && !isDone;

  // Refs to hold authoritative values during pipeline execution.
  const dataRef      = useRef<RequestData>(createRequestData());
  const statusesRef  = useRef<NodeStatuses>(INITIAL_STATUSES);
  const isRunningRef = useRef(false); // Tracks whether the pipeline is running.
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null); // Tracks the heartbeat interval.

  // ── Heartbeat management ─────────────────────────────────────────────────

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

  // ── Apply a database row to both refs and React state ────────────────────

  function applyRunRow(run: Pick<RunRow, "context_payload" | "node_statuses">) {
    const data     = run.context_payload ?? createRequestData();
    const statuses = run.node_statuses   ?? INITIAL_STATUSES;
    dataRef.current     = data;
    statusesRef.current = statuses;
    setRequestData(data);
    setNodeStatuses(statuses);
  }

  // ── On mount: restore the most recent in-progress run ────────────────────

  useEffect(() => {
    async function init() {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/rag_pipeline_runs` +
        `?status=neq.done&status=neq.aborted&order=created_at.desc&limit=1`,
        { headers: makeHeaders() },
      );
      const rows: RunRow[] = await res.json();
      if (!rows[0]) return;
      const row = rows[0];

      // If the run has stale heartbeat (>30s) and wasn't owned by this client,
      // it's an orphan from a closed tab. Clear any stuck "working" nodes so the
      // UI doesn't spin forever, and mark the run as stalled so it can be resumed.
      const heartbeatAge = row.last_heartbeat_at
        ? Date.now() - new Date(row.last_heartbeat_at).getTime()
        : Infinity;
      const isOrphan = heartbeatAge > 30_000 && row.active_client_id !== CLIENT_ID;
      const hasWorkingNode = Object.values(row.node_statuses ?? {}).some((s) => s === "working");

      if (isOrphan && hasWorkingNode) {
        const clearedStatuses: NodeStatuses = Object.fromEntries(
          Object.entries(row.node_statuses).map(([k, v]) => [k, v === "working" ? "outstanding" : v]),
        ) as NodeStatuses;
        await patchRun(row.id, {
          status: "stalled",
          node_statuses: clearedStatuses,
          active_client_id: null,
        });
        row.node_statuses = clearedStatuses;
        row.status = "stalled";
      }

      setRunId(row.id);
      applyRunRow(row);
    }
    void init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime: sync state from database, but skip echoes of our own writes ─

  useEffect(() => {
    if (!runId) return;
    const channel = supabaseBrowser
      .channel(`rag_run:${runId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rag_pipeline_runs", filter: `id=eq.${runId}` },
        (payload) => {
          if (isRunningRef.current) return; // Skip echoes of our own writes.
          const updated = payload.new as RunRow;
          applyRunRow(updated);
          if (updated.status === "done" || updated.status === "aborted") {
            stopHeartbeat();
          }
        },
      )
      .subscribe();
    return () => { void supabaseBrowser.removeChannel(channel); };
  }, [runId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => stopHeartbeat(), []);

  // ── Start a new pipeline run ─────────────────────────────────────────────

  const startPipeline = useCallback(async (form: RequestInterpretation): Promise<string> => {
    const initData: RequestData  = createRequestData(form);
    const initStatuses: NodeStatuses = {
      ...INITIAL_STATUSES,
      "request-submitted": "done",
      "translation":        "working",
      "internal-coherence": "working",
    };

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

    dataRef.current     = initData;
    statusesRef.current = initStatuses;
    setRunId(id);
    setRequestData(initData);
    setNodeStatuses(initStatuses);
    startHeartbeat(id);

    void runPipeline(id, form);

    return id;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Internal pipeline executor ───────────────────────────────────────────

  const runPipeline = useCallback(async (
    id: string,
    form: RequestInterpretation,
    skipBlockingChecks = false,
    resumeFrom?: { data: RequestData; completedStages: Set<string> },
  ) => {
    isRunningRef.current = true;
    if (resumeFrom) {
      dataRef.current = resumeFrom.data;
    }
    try {
      await core_agent(form, (nodeName, patch) => {
        const nextData    = mergeRequestData(dataRef.current, patch);
        const graphId     = NODE_NAME_TO_GRAPH_ID[nodeName];
        const nodeStatus  = graphId ? deriveStatus(nodeName, patch) : undefined;
        const effectiveStatus = (skipBlockingChecks && nodeStatus === "escalation") ? "warning" : nodeStatus;
        const withUpdate  = graphId
          ? { ...statusesRef.current, [graphId]: effectiveStatus! }
          : statusesRef.current;
        const nextStatuses = (graphId && effectiveStatus !== "escalation")
          ? propagateWorking(withUpdate, graphId, skipBlockingChecks)
          : withUpdate;

        
        // console.log("skip-blocking-checks:", skipBlockingChecks, "for", nodeName, "with", nodeStatus, "and effectiveStatus", effectiveStatus)

        if (nodeName === "final_check") {
          let all_good = !(Object.entries(nextStatuses) as [string, PipelineNodeStatus][]).some(([, value]) => value === "escalation" || value === "warning")
          if (all_good) {
            nextStatuses["done"] = "done"
          } else {
            nextStatuses["done"] = "escalation"
          }
        }




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
      }, { skipBlockingChecks, resumeFrom });
    } finally {
      isRunningRef.current = false;
      const isBlocked = !skipBlockingChecks && Object.values(dataRef.current.stages).some(
        (s) => s.escalations?.some((e) => e.blocking) || s.issues?.some((i) => i.blocking),
      );
      // If any node is still "working" (e.g. API threw before onUpdate fired), move it to
      // "warning" so the UI doesn't spin forever on a dead pipeline.
      const clearedStatuses: NodeStatuses = Object.fromEntries(
        Object.entries(statusesRef.current).map(([k, v]) => [k, v === "working" ? "warning" : v]),
      ) as NodeStatuses;
      const finalStatuses: NodeStatuses = isBlocked
        ? clearedStatuses
        : { ...clearedStatuses, "done": "done" };
      statusesRef.current = finalStatuses;
      setNodeStatuses(finalStatuses);
      void patchRun(id, {
        status:            isBlocked ? "blocked" : "done",
        node_statuses:     finalStatuses,
        last_heartbeat_at: new Date().toISOString(),
      });
      stopHeartbeat();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Approve a blocked run and re-run the pipeline from scratch ───────────

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
    startHeartbeat(existingRunId);

    void runPipeline(existingRunId, updatedInterp, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resolve a single blocking issue and resume from that point ───────────

  const resolveIssue = useCallback(async (
    runId: string,
    data: RequestData,
    existingNodeStatuses: NodeStatuses,
    stageKey: string,
    issueId: string,
  ): Promise<void> => {
    const stageId = stageKey as StageId;
    const stage = data.stages[stageId];
    if (!stage) return;

    const resolvedByLabel = stage.issues.find((i) => i.issue_id === issueId)?.escalate_to ?? "Approver";

    const updatedData: RequestData = {
      ...data,
      stages: {
        ...data.stages,
        [stageId]: {
          ...stage,
          issues: stage.issues.map((i) =>
            i.issue_id === issueId ? { ...i, blocking: false, resolved: true } : i,
          ),
        },
      },
    };

    await patchRun(runId, { context_payload: updatedData });

    const stillBlocked = Object.values(updatedData.stages).some(
      (s) => s.escalations?.some((e) => e.blocking) || s.issues?.some((i) => i.blocking),
    );
    if (stillBlocked) return;

    const approvalNote = `Resolved by ${resolvedByLabel} on ${new Date().toISOString().slice(0, 10)}`;
    const updatedInterp: RequestInterpretation = {
      ...updatedData.request_interpretation,
      requester_instruction: approvalNote,
    };
    const updatedDataWithNote: RequestData = {
      ...updatedData,
      request_interpretation: updatedInterp,
    };

    const initStatuses: NodeStatuses = Object.fromEntries(
      Object.entries(existingNodeStatuses).map(([k, v]) => [k, v === "working" ? "outstanding" : v]),
    ) as NodeStatuses;

    await patchRun(runId, {
      status:            "resuming",
      context_payload:   updatedDataWithNote,
      node_statuses:     initStatuses,
      active_client_id:  CLIENT_ID,
      last_heartbeat_at: new Date().toISOString(),
    });

    dataRef.current     = updatedDataWithNote;
    statusesRef.current = initStatuses;
    setRunId(runId);
    setRequestData(updatedDataWithNote);
    setNodeStatuses(initStatuses);
    startHeartbeat(runId);

    const completedStages = computeCompletedStages(existingNodeStatuses);
    void runPipeline(runId, updatedInterp, true, { data: updatedDataWithNote, completedStages });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Acknowledge an advisory item (no pipeline resume) ────────────────────

  const acknowledgeItem = useCallback(async (
    runId: string,
    data: RequestData,
    stageKey: string,
    type: "issue" | "escalation",
    itemId: string,
  ): Promise<void> => {
    const stageId = stageKey as StageId;
    const stage = data.stages[stageId];
    if (!stage) return;

    let updatedData: RequestData;
    if (type === "issue") {
      updatedData = {
        ...data,
        stages: {
          ...data.stages,
          [stageId]: {
            ...stage,
            issues: stage.issues.map((i) =>
              i.issue_id === itemId ? { ...i, resolved: true } : i
            ),
          },
        },
      };
    } else {
      updatedData = {
        ...data,
        stages: {
          ...data.stages,
          [stageId]: {
            ...stage,
            escalations: stage.escalations.map((e) =>
              e.escalation_id === itemId ? { ...e, acknowledged: true } : e
            ),
          },
        },
      };
    }

    await patchRun(runId, { context_payload: updatedData });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { runId, requestData, nodeStatuses, isPipelineRunning, mode: "owner", startPipeline, approveAndResume, resolveIssue, acknowledgeItem };
}
