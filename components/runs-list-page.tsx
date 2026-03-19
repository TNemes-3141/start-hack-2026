"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { ArrowLeft, Loader2, RefreshCw, ChevronRight, GitBranch, AlertTriangle, ShieldAlert, FileDown, Braces } from "lucide-react"
import { supabaseBrowser } from "@/lib/supabase-browser"
import { PipelineGraphView } from "@/components/pipeline-graph-view"
import { INITIAL_STATUSES, type NodeStatuses } from "@/lib/pipeline-graph"
import { createRequestData, type RequestData } from "@/lib/request-data"
import { Badge } from "@/components/ui/badge"
import { useRequestStore } from "@/lib/request-store"

// ── Types ─────────────────────────────────────────────────────────────────────

type RunRow = {
  id: string
  created_at: string
  updated_at: string
  status: string
  context_payload: RequestData
  node_statuses: NodeStatuses
  active_client_id: string | null
  last_heartbeat_at: string | null
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!

function restHeaders() {
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)  return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

type StatusMeta = { label: string; dot: string; badge: "default" | "secondary" | "destructive" | "outline"; bar: string }

function getStatusMeta(status: string): StatusMeta {
  if (status === "done")             return { label: "Completed",          dot: "bg-emerald-500",            badge: "default",     bar: "bg-emerald-500" }
  if (status === "aborted")          return { label: "Aborted",            dot: "bg-red-500",                badge: "destructive", bar: "bg-red-500" }
  if (status === "blocked")          return { label: "Approval Required",  dot: "bg-amber-500 animate-pulse", badge: "destructive", bar: "bg-amber-500" }
  if (status === "idle")             return { label: "Idle",               dot: "bg-muted-foreground/40",    badge: "outline",     bar: "bg-muted-foreground/30" }
  if (status.endsWith("_active"))    return { label: "Running",            dot: "bg-blue-500 animate-pulse",  badge: "secondary",   bar: "bg-blue-500" }
  if (status.endsWith("_complete"))  return { label: "In Progress",        dot: "bg-sky-400",                badge: "secondary",   bar: "bg-sky-400" }
  return                                    { label: status,               dot: "bg-muted-foreground/40",    badge: "outline",     bar: "bg-muted-foreground/30" }
}

function countIssues(run: RunRow) {
  let warnings = 0, escalations = 0
  if (run.context_payload?.stages) {
    for (const stage of Object.values(run.context_payload.stages)) {
      escalations += (stage.escalations?.filter((e) => e.blocking).length ?? 0)
                + (stage.issues?.filter((i) => i.blocking).length ?? 0)
      warnings    += stage.issues?.filter((i) => !i.blocking).length ?? 0
    }
  }
  return { warnings, escalations }
}

function isClosed(status: string) {
  return status === "done" || status === "aborted"
}

// ── Run card ──────────────────────────────────────────────────────────────────

function downloadJson(run: RunRow, e: React.MouseEvent) {
  e.stopPropagation()
  const blob = new Blob([JSON.stringify(run.context_payload, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `context-payload-${run.context_payload?.request_id ?? run.id}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function RunCard({ run, onClick }: { run: RunRow; onClick: () => void }) {
  const [downloading, setDownloading] = useState(false)

  async function downloadPdf(e: React.MouseEvent) {
    e.stopPropagation()
    setDownloading(true)
    try {
      const res = await fetch("/api/generate_text_summary_for_client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(run.context_payload),
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `procurement-report-${run.context_payload?.request_id ?? run.id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  const interp   = run.context_payload?.request_interpretation
  const title    = interp?.title || interp?.category_l2 || "Untitled Request"
  const catL1    = interp?.category_l1
  const catL2    = interp?.category_l2
  const budget   = interp?.budget_amount
  const currency = interp?.currency
  const bu       = interp?.business_unit
  const country  = interp?.country
  const { label, dot, badge, bar } = getStatusMeta(run.status)
  const { warnings, escalations }  = countIssues(run)

  return (
    <button
      onClick={onClick}
      className="group w-full text-left flex items-stretch hover:bg-accent/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className={`w-0.5 shrink-0 ${bar} opacity-60 group-hover:opacity-100 transition-opacity`} />

      <div className="flex-1 flex items-start justify-between gap-4 px-5 py-4">
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2.5">
            <span className={`h-2 w-2 rounded-full shrink-0 ${dot}`} />
            <p className="text-sm font-semibold text-foreground leading-snug line-clamp-1">{title}</p>
          </div>

          {(catL1 || catL2) && (
            <p className="text-xs text-muted-foreground pl-[18px]">
              {[catL1, catL2].filter(Boolean).join(" · ")}
            </p>
          )}

          <div className="flex items-center gap-1.5 pl-[18px] flex-wrap">
            {bu && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{bu}</span>
            )}
            {country && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{country}</span>
            )}
            {escalations > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                <ShieldAlert className="h-3 w-3" />{escalations} escalation{escalations > 1 ? "s" : ""}
              </span>
            )}
            {warnings > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />{warnings} warning{warnings > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <Badge variant={badge} className="text-[10px]">{label}</Badge>
          {budget != null && currency && (
            <span className="text-sm font-bold text-foreground tabular-nums">
              {currency} {budget.toLocaleString()}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground/60">{timeAgo(run.updated_at ?? run.created_at)}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 pr-3 pl-1">
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => downloadJson(run, e)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") downloadJson(run, e as unknown as React.MouseEvent) }}
          title="Download raw JSON"
          className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
        >
          <Braces className="h-4 w-4" />
        </div>
        <div
          role="button"
          tabIndex={0}
          onClick={downloadPdf}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") void downloadPdf(e as unknown as React.MouseEvent) }}
          aria-disabled={downloading}
          title="Download PDF report"
          className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors aria-disabled:opacity-40 cursor-pointer"
        >
          {downloading
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <FileDown className="h-4 w-4" />}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </button>
  )
}

// ── Graph header ──────────────────────────────────────────────────────────────

function GraphHeader({ run, onBack }: { run: RunRow; onBack: () => void }) {
  const [downloading, setDownloading] = useState(false)
  const interp = run.context_payload?.request_interpretation
  const title  = interp?.title || interp?.category_l2 || "Untitled Request"
  const catL1  = interp?.category_l1
  const catL2  = interp?.category_l2
  const { label, dot, badge } = getStatusMeta(run.status)

  async function downloadPdf() {
    setDownloading(true)
    try {
      const res = await fetch("/api/generate_text_summary_for_client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(run.context_payload),
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `procurement-report-${run.context_payload?.request_id ?? run.id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background/80 backdrop-blur shrink-0">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>
      <div className="h-4 w-px bg-border" />
      <span className={`h-2 w-2 rounded-full shrink-0 ${dot}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{title}</p>
        {(catL1 || catL2) && (
          <p className="text-xs text-muted-foreground">{[catL1, catL2].filter(Boolean).join(" · ")}</p>
        )}
      </div>
      <Badge variant={badge} className="text-[10px] shrink-0">{label}</Badge>
      <button
        onClick={() => downloadJson(run, { stopPropagation: () => {} } as React.MouseEvent)}
        title="Download raw JSON"
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <Braces className="h-4 w-4" />
      </button>
      <button
        onClick={() => void downloadPdf()}
        disabled={downloading}
        title="Download PDF report"
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
      >
        {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
      </button>
    </div>
  )
}

// ── Escalation info card ──────────────────────────────────────────────────────

function EscalationInfoCard({ requestData }: { requestData: RequestData }) {
  const escalations = Object.values(requestData.stages).flatMap((s) => s.escalations ?? [])
  if (escalations.length === 0) return null

  const blocking    = escalations.filter((e) => e.blocking)
  const advisory    = escalations.filter((e) => !e.blocking)

  return (
    <div className="w-full border-b border-border bg-destructive/5 px-6 py-3 shrink-0">
      <div className="flex items-center gap-2 mb-2">
        <ShieldAlert className="h-4 w-4 text-destructive shrink-0" />
        <span className="text-sm font-semibold text-destructive">
          {blocking.length > 0
            ? `${blocking.length} blocking escalation${blocking.length > 1 ? "s" : ""}`
            : `${advisory.length} advisory escalation${advisory.length > 1 ? "s" : ""}`}
        </span>
        {blocking.length > 0 && advisory.length > 0 && (
          <span className="text-xs text-muted-foreground">+ {advisory.length} advisory</span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {escalations.map((e) => (
          <div
            key={e.escalation_id}
            className="flex items-start gap-3 rounded-md border bg-background px-3 py-2"
          >
            <span className={`mt-px inline-flex h-2 w-2 shrink-0 rounded-full ${e.blocking ? "bg-destructive" : "bg-amber-500"}`} />
            <div className="flex-1 min-w-0 flex items-baseline gap-2 flex-wrap">
              <span className="font-mono text-[11px] font-semibold text-muted-foreground shrink-0">{e.rule}</span>
              <span className="text-xs text-foreground leading-snug">{e.trigger}</span>
            </div>
            <span className="text-[11px] text-muted-foreground shrink-0 whitespace-nowrap">
              → <span className="font-medium text-foreground">{e.escalate_to}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

// ── Escalation filter helpers ─────────────────────────────────────────────────

// Returns true if the run has at least one BLOCKING escalation.
// When targets is empty, any blocking escalation matches. When targets has entries,
// at least one blocking escalation's escalate_to must contain one of the target strings.
function runHasEscalationFor(run: RunRow, targets: string[]): boolean {
  if (!run.context_payload?.stages) return false
  for (const stage of Object.values(run.context_payload.stages)) {
    for (const e of stage.escalations ?? []) {
      if (!e.blocking) continue
      if (targets.length === 0) return true
      if (targets.some((t) => e.escalate_to?.toLowerCase().includes(t.toLowerCase())))
        return true
    }
    for (const i of stage.issues ?? []) {
      if (!i.blocking) continue
      if (targets.length === 0) return true
      if (targets.some((t) => i.escalate_to?.toLowerCase().includes(t.toLowerCase())))
        return true
    }
  }
  return false
}

// ── Main ──────────────────────────────────────────────────────────────────────

// escalateTo: when provided, show ALL runs filtered by escalation target (ignores `closed`).
export function RunsListPage({
  closed,
  escalateTo,
}: {
  closed?: boolean
  escalateTo?: string[]
}) {
  const isEscalationMode = escalateTo !== undefined

  const { approveAndResume, resolveIssue } = useRequestStore()
  const [roleLabel, setRoleLabel] = useState<string | null>(null)
  useEffect(() => {
    fetch("/api/session").then(r => r.json()).then((d: { roleLabel: string | null }) => setRoleLabel(d.roleLabel)).catch(() => null)
  }, [])

  const searchParams  = useSearchParams()
  const autoRunId     = searchParams.get("run")
  const didAutoSelect = useRef(false)

  const [allRuns, setAllRuns]         = useState<RunRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [selectedRun, setSelectedRun] = useState<RunRow | null>(null)
  const [loadingRun, setLoadingRun]   = useState(false)

  // Derive visible runs: in escalation mode, filter client-side by target.
  const runs = isEscalationMode
    ? allRuns.filter((r) => runHasEscalationFor(r, escalateTo))
    : allRuns

  // Stable ref so the Realtime handler always has the current selected ID.
  const selectedIdRef  = useRef<string | null>(null)
  const escalateToRef  = useRef(escalateTo)
  useEffect(() => { selectedIdRef.current = selectedRun?.id ?? null }, [selectedRun])
  useEffect(() => { escalateToRef.current = escalateTo }, [escalateTo])

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchRuns = useCallback(async () => {
    setLoading(true)
    // Escalation mode: fetch all runs (any status). Otherwise filter by bucket.
    const filter = isEscalationMode
      ? ""
      : closed
        ? "status=in.(done,aborted)&"
        : "status=not.in.(done,aborted)&"
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/rag_pipeline_runs?${filter}order=updated_at.desc&limit=200`,
      { headers: restHeaders() },
    )
    if (res.ok) setAllRuns(await res.json())
    setLoading(false)
  }, [closed, isEscalationMode])

  useEffect(() => { void fetchRuns() }, [fetchRuns])

  // ── Realtime ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const channelKey = isEscalationMode ? "escalations" : closed ? "closed" : "open"
    const channel = supabaseBrowser
      .channel(`runs-list-${channelKey}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rag_pipeline_runs" }, (payload) => {
        const updated = payload.new as RunRow | undefined
        const removed = payload.old as { id: string } | undefined

        if (payload.eventType === "INSERT" && updated) {
          if (isEscalationMode) {
            // Only add if it already has matching escalations (rare on INSERT, but handle it)
            if (runHasEscalationFor(updated, escalateToRef.current ?? []))
              setAllRuns((p) => [updated, ...p])
          } else {
            if (isClosed(updated.status) === closed)
              setAllRuns((p) => [updated, ...p])
          }

        } else if (payload.eventType === "UPDATE" && updated) {
          setAllRuns((prev) => {
            const exists = prev.some((r) => r.id === updated.id)
            if (!isEscalationMode) {
              // Bucket-based: remove if it moved to the other bucket, else update in-place
              if (isClosed(updated.status) !== closed)
                return prev.filter((r) => r.id !== updated.id)
            }
            // Update in-place (preserve order) or insert at top if newly appeared
            if (exists) return prev.map((r) => r.id === updated.id ? updated : r)
            return [updated, ...prev]
          })
          if (updated.id === selectedIdRef.current) setSelectedRun(updated)

        } else if (payload.eventType === "DELETE" && removed) {
          setAllRuns((p) => p.filter((r) => r.id !== removed.id))
          if (removed.id === selectedIdRef.current) setSelectedRun(null)
        }
      })
      .subscribe()

    return () => { void supabaseBrowser.removeChannel(channel) }
  }, [closed, isEscalationMode]) // stable — selectedRun and escalateTo tracked via refs

  // ── Auto-select from query param ──────────────────────────────────────────

  useEffect(() => {
    if (autoRunId && !didAutoSelect.current && !loading) {
      didAutoSelect.current = true
      void selectRun(autoRunId)
    }
  }, [autoRunId, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Select ────────────────────────────────────────────────────────────────

  async function selectRun(id: string) {
    setLoadingRun(true)
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/rag_pipeline_runs?id=eq.${id}&limit=1`,
      { headers: restHeaders() },
    )
    const rows: RunRow[] = await res.json()
    setSelectedRun(rows[0] ?? null)
    setLoadingRun(false)
  }

  // ── Title ─────────────────────────────────────────────────────────────────

  const pageTitle = isEscalationMode
    ? "My Escalations"
    : closed ? "Closed Requests" : "Open Requests"

  const emptyDescription = isEscalationMode
    ? "No requests have been escalated to you yet."
    : closed
      ? "Requests will appear here once they finish processing."
      : "Submit a new request from the sidebar to kick off the procurement pipeline."

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadingRun) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem-3rem)] gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading pipeline…</span>
      </div>
    )
  }

  if (selectedRun) {
    const isRunning = !isClosed(selectedRun.status) && selectedRun.status !== "idle" && selectedRun.status !== "blocked"
    const isBlocked = selectedRun.status === "blocked"
    const handleApprove = isBlocked
      ? async () => {
          await approveAndResume(
            selectedRun.id,
            selectedRun.context_payload ?? createRequestData(),
            roleLabel ?? "Unknown Role",
          )
        }
      : undefined
    return (
      <div className="flex flex-col h-[calc(100vh-3.5rem-3rem)] -m-6">
        <GraphHeader run={selectedRun} onBack={() => setSelectedRun(null)} />
        <EscalationInfoCard requestData={selectedRun.context_payload ?? createRequestData()} />
        <div className="flex-1 p-6 min-h-0 h-full">
          <PipelineGraphView
            nodeStatuses={selectedRun.node_statuses ?? INITIAL_STATUSES}
            requestData={selectedRun.context_payload ?? createRequestData()}
            isPipelineRunning={isRunning}
            mode="owner"
            onApprove={handleApprove}
            onResolveIssue={async (stageKey, issueId) => {
              await resolveIssue(selectedRun.id, selectedRun.context_payload ?? createRequestData(), selectedRun.node_statuses ?? INITIAL_STATUSES, stageKey, issueId)
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem-3rem)] -m-6">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background shrink-0">
        <div>
          <h1 className="text-base font-semibold text-foreground">{pageTitle}</h1>
          {!loading && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {runs.length} request{runs.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <button
          onClick={() => void fetchRuns()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center px-8 py-16">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted">
              <GitBranch className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">{pageTitle === "My Escalations" ? "No escalations" : `No ${pageTitle.toLowerCase()}`}</p>
            <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">{emptyDescription}</p>
          </div>
        ) : (
          runs.map((run) => (
            <RunCard key={run.id} run={run} onClick={() => void selectRun(run.id)} />
          ))
        )}
      </div>
    </div>
  )
}
