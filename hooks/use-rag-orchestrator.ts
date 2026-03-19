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
  type StageId,
} from "@/lib/request-data";
import {
  INITIAL_STATUSES,
  NODE_NAME_TO_GRAPH_ID,
  TERMINAL_STATUSES,
  deriveStatus,
  propagateWorking,
  type NodeStatuses,
  type PipelineNodeStatus,
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
  resolveIssue: (runId: string, data: RequestData, existingNodeStatuses: NodeStatuses, stageKey: string, issueId: string) => Promise<void>;
  resolveEscalations: (runId: string, data: RequestData, existingNodeStatuses: NodeStatuses, approvedByLabel: string, targetMatchers: string[]) => Promise<void>;
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

  // ── Internal pipeline executor ─────────────────────────────────────────────

  const runPipeline = useCallback(async (
    id: string,
    form: RequestInterpretation,
    skipBlockingChecks = false,
    resumeFrom?: { data: RequestData; completedStages: Set<string> },
  ) => {
    isRunningRef.current = true;
    // When resuming, seed the data ref with the existing run's data so downstream
    // stages receive correct inputs (eligible_suppliers, approval_tier, etc.).
    if (resumeFrom) {
      dataRef.current = resumeFrom.data;
    }
    try {
      await core_agent(form, (nodeName, patch) => {
        // When running with approval, strip blocking flags so no escalation stays
        // blocking in the stored payload and the run reaches "done" cleanly.
        const effectivePatch: RequestDataPatch = skipBlockingChecks && patch.stages
          ? {
              ...patch,
              stages: Object.fromEntries(
                Object.entries(patch.stages).map(([sid, s]) => [
                  sid,
                  {
                    ...s,
                    escalations: (s.escalations ?? []).map((e) => ({ ...e, blocking: false })),
                    issues:      (s.issues      ?? []).map((i) => ({ ...i, blocking: false })),
                  },
                ]),
              ),
            }
          : patch;
        // Compute next state from refs — synchronous, no stale closures.
        const nextData    = mergeRequestData(dataRef.current, effectivePatch);
        const graphId     = NODE_NAME_TO_GRAPH_ID[nodeName];
        const nodeStatus  = graphId ? deriveStatus(nodeName, patch) : undefined;
        // On an approved/resumed run, treat blocking nodes as warnings so propagation continues.
        const effectiveStatus = (skipBlockingChecks && nodeStatus === "escalation") ? "warning" : nodeStatus;
        const withUpdate  = graphId
          ? { ...statusesRef.current, [graphId]: effectiveStatus! }
          : statusesRef.current;
        // Only propagate "working" to successors when node is NOT blocking.
        const nextStatuses = (graphId && effectiveStatus !== "escalation")
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
      }, { skipBlockingChecks, resumeFrom });
    } finally {
      isRunningRef.current = false;
      // When skipBlockingChecks is true (approved/resumed run), never re-block at completion.
      const isBlocked = !skipBlockingChecks && Object.values(dataRef.current.stages).some(
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

  // ── Approve a blocked run and re-run the pipeline from scratch ─────────────

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

    void runPipeline(existingRunId, updatedInterp, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resolve a single blocking issue and resume from that point ────────────

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

    // Persist the resolved state first.
    await patchRun(runId, { context_payload: updatedData });

    // Check whether any blocking issues or escalations remain.
    const stillBlocked = Object.values(updatedData.stages).some(
      (s) => s.escalations?.some((e) => e.blocking) || s.issues?.some((i) => i.blocking),
    );
    if (stillBlocked) return;

    // All blocking cleared — resume from where the pipeline was blocked.
    const approvalNote = `Resolved by ${resolvedByLabel} on ${new Date().toISOString().slice(0, 10)}`;
    const updatedInterp: RequestInterpretation = {
      ...updatedData.request_interpretation,
      requester_instruction: approvalNote,
    };
    const updatedDataWithNote: RequestData = {
      ...updatedData,
      request_interpretation: updatedInterp,
    };

    // Keep statuses from the existing run; reset any "working" nodes to "outstanding".
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
    setIsPipelineRunning(true);
    startHeartbeat(runId);

    // Skip stages that already completed in the previous run.
    const completedStages = computeCompletedStages(existingNodeStatuses);
    void runPipeline(runId, updatedInterp, true, { data: updatedDataWithNote, completedStages });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resolve escalations targeted at a specific role and resume in-place ─────
  //
  // Unlike approveAndResume (which wipes data and restarts from scratch), this
  // function marks only the matching blocking escalations/issues as resolved,
  // then resumes from the furthest completed stage — identical to resolveIssue.

  const resolveEscalations = useCallback(async (
    runId: string,
    data: RequestData,
    existingNodeStatuses: NodeStatuses,
    approvedByLabel: string,
    targetMatchers: string[],
  ): Promise<void> => {
    const matches = (target: string) =>
      targetMatchers.length === 0 ||
      targetMatchers.some((t) => target?.toLowerCase().includes(t.toLowerCase()));

    // Clear blocking flag on all matched escalations and issues.
    const updatedData: RequestData = {
      ...data,
      stages: Object.fromEntries(
        Object.entries(data.stages).map(([stageKey, stage]) => [
          stageKey,
          {
            ...stage,
            escalations: (stage.escalations ?? []).map((e) =>
              e.blocking && matches(e.escalate_to) ? { ...e, blocking: false } : e,
            ),
            issues: (stage.issues ?? []).map((i) =>
              i.blocking && matches(i.escalate_to) ? { ...i, blocking: false, resolved: true } : i,
            ),
          },
        ]),
      ),
    } as RequestData;

    await patchRun(runId, { context_payload: updatedData });

    // If other blocking escalations/issues remain (from a different role), stop here.
    const stillBlocked = Object.values(updatedData.stages).some(
      (s) => s.escalations?.some((e) => e.blocking) || s.issues?.some((i) => i.blocking),
    );
    if (stillBlocked) return;

    const approvalNote = `Resolved by ${approvedByLabel} on ${new Date().toISOString().slice(0, 10)}`;
    const updatedInterp: RequestInterpretation = {
      ...updatedData.request_interpretation,
      requester_instruction: approvalNote,
    };

    // Stages that were in "escalation" state must RE-RUN (not be skipped) so their
    // subsequent steps execute properly.  Clear their stale stage results now so the
    // re-run produces a fresh, non-duplicated record.  Top-level computed fields
    // (approval_tier, eligible_suppliers, etc.) are unaffected.
    const escalationGraphIds = new Set(
      Object.entries(existingNodeStatuses)
        .filter(([, v]) => v === "escalation")
        .map(([k]) => k),
    );
    const graphIdToStageName = Object.fromEntries(
      Object.entries(NODE_NAME_TO_GRAPH_ID).map(([name, gid]) => [gid, name]),
    );
    const escalationStageNames = new Set(
      [...escalationGraphIds].map((gid) => graphIdToStageName[gid]).filter(Boolean),
    );

    const dataForResume: RequestData = {
      ...updatedData,
      request_interpretation: updatedInterp,
      stages: Object.fromEntries(
        Object.entries(updatedData.stages).map(([k, v]) => [
          k,
          escalationStageNames.has(k)
            ? { issues: [], escalations: [], reasonings: [], policy_violations: [] }
            : v,
        ]),
      ),
    } as RequestData;

    // Skip only stages that completed cleanly (done/warning).
    // Escalation-state nodes are excluded so they re-run with skipBlockingChecks=true.
    const statusesForSkip = Object.fromEntries(
      Object.entries(existingNodeStatuses).map(([k, v]) => [k, v === "escalation" ? "outstanding" : v]),
    ) as NodeStatuses;
    const completedStages = computeCompletedStages(statusesForSkip);

    // Keep existing node statuses; reset "working" and "escalation" nodes to "outstanding".
    const initStatuses: NodeStatuses = Object.fromEntries(
      Object.entries(existingNodeStatuses).map(([k, v]) =>
        [k, (v === "working" || v === "escalation") ? "outstanding" : v],
      ),
    ) as NodeStatuses;

    await patchRun(runId, {
      status:            "resuming",
      context_payload:   dataForResume,
      node_statuses:     initStatuses,
      active_client_id:  CLIENT_ID,
      last_heartbeat_at: new Date().toISOString(),
    });

    dataRef.current     = dataForResume;
    statusesRef.current = initStatuses;
    setRunId(runId);
    setRequestData(dataForResume);
    setNodeStatuses(initStatuses);
    setIsPipelineRunning(true);
    startHeartbeat(runId);

    void runPipeline(runId, updatedInterp, true, { data: dataForResume, completedStages });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { runId, requestData, nodeStatuses, isPipelineRunning, mode: "owner", startPipeline, approveAndResume, resolveIssue, resolveEscalations };
}
