"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { ArrowLeft, Loader2, RefreshCw, ChevronRight, GitBranch, AlertTriangle, ShieldAlert } from "lucide-react"
import { supabaseBrowser } from "@/lib/supabase-browser"
import { PipelineGraphView } from "@/components/pipeline-graph-view"
import { INITIAL_STATUSES, type NodeStatuses } from "@/lib/pipeline-graph"
import { createRequestData, type RequestData } from "@/lib/request-data"
import { Badge } from "@/components/ui/badge"

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

type StatusMeta = {
  label: string
  dot: string
  badge: "default" | "secondary" | "destructive" | "outline"
  bar: string
}

function getStatusMeta(status: string): StatusMeta {
  if (status === "done")
    return { label: "Completed", dot: "bg-emerald-500", badge: "default", bar: "bg-emerald-500" }
  if (status === "aborted")
    return { label: "Aborted", dot: "bg-red-500", badge: "destructive", bar: "bg-red-500" }
  if (status === "idle")
    return { label: "Idle", dot: "bg-muted-foreground/40", badge: "outline", bar: "bg-muted-foreground/30" }
  if (status.endsWith("_active"))
    return { label: "Running", dot: "bg-blue-500 animate-pulse", badge: "secondary", bar: "bg-blue-500" }
  if (status.endsWith("_complete"))
    return { label: "In Progress", dot: "bg-sky-400", badge: "secondary", bar: "bg-sky-400" }
  return { label: status, dot: "bg-muted-foreground/40", badge: "outline", bar: "bg-muted-foreground/30" }
}

function restHeaders() {
  return {
    apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!}`,
  }
}

function countIssues(run: RunRow) {
  let warnings = 0, escalations = 0
  if (run.context_payload?.stages) {
    for (const stage of Object.values(run.context_payload.stages)) {
      escalations += stage.escalations?.filter((e) => e.blocking).length ?? 0
      warnings    += stage.issues?.filter((i) => !i.blocking).length ?? 0
    }
  }
  return { warnings, escalations }
}

// ── Run card ──────────────────────────────────────────────────────────────────

function RunCard({ run, onClick }: { run: RunRow; onClick: () => void }) {
  const interp = run.context_payload?.request_interpretation
  const title    = interp?.title || interp?.category_l2 || "Untitled Request"
  const catL1    = interp?.category_l1
  const catL2    = interp?.category_l2
  const budget   = interp?.budget_amount
  const currency = interp?.currency
  const bu       = interp?.business_unit
  const country  = interp?.country
  const { label, dot, badge, bar } = getStatusMeta(run.status)
  const { warnings, escalations } = countIssues(run)

  return (
    <button
      onClick={onClick}
      className="group w-full text-left flex items-stretch gap-0 hover:bg-accent/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Left status bar */}
      <div className={`w-0.5 shrink-0 ${bar} opacity-70 group-hover:opacity-100 transition-opacity`} />

      <div className="flex-1 flex items-start justify-between gap-4 px-5 py-4">
        <div className="flex-1 min-w-0 space-y-2">
          {/* Title row */}
          <div className="flex items-center gap-2.5">
            <span className={`h-2 w-2 rounded-full shrink-0 ${dot}`} />
            <p className="text-sm font-semibold text-foreground leading-snug line-clamp-1 flex-1">
              {title}
            </p>
          </div>

          {/* Category row */}
          {(catL1 || catL2) && (
            <p className="text-xs text-muted-foreground pl-4.5">
              {[catL1, catL2].filter(Boolean).join(" · ")}
            </p>
          )}

          {/* Tags row */}
          <div className="flex items-center gap-1.5 pl-4.5 flex-wrap">
            {bu && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {bu}
              </span>
            )}
            {country && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {country}
              </span>
            )}
            {escalations > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                <ShieldAlert className="h-3 w-3" />
                {escalations} escalation{escalations > 1 ? "s" : ""}
              </span>
            )}
            {warnings > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                {warnings} warning{warnings > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Right side */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <Badge variant={badge} className="text-[10px]">{label}</Badge>
          {budget != null && currency && (
            <span className="text-sm font-bold text-foreground tabular-nums">
              {currency} {budget.toLocaleString()}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground/60">
            {timeAgo(run.updated_at ?? run.created_at)}
          </span>
        </div>
      </div>

      {/* Chevron */}
      <div className="flex items-center pr-3 pl-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </button>
  )
}

// ── Graph header ──────────────────────────────────────────────────────────────

function GraphHeader({ run, onBack }: { run: RunRow; onBack: () => void }) {
  const interp = run.context_payload?.request_interpretation
  const title    = interp?.title || interp?.category_l2 || "Untitled Request"
  const catL1    = interp?.category_l1
  const catL2    = interp?.category_l2
  const { label, dot, badge } = getStatusMeta(run.status)

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
    </div>
  )
}

// ── Empty list state ──────────────────────────────────────────────────────────

function EmptyList({ closed }: { closed: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center px-8 py-16">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted">
        <GitBranch className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">
        {closed ? "No closed requests" : "No open requests"}
      </p>
      <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
        {closed
          ? "Requests will appear here once they finish processing."
          : "Submit a new request from the sidebar to kick off the procurement pipeline."}
      </p>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function RunsListPage({ closed }: { closed: boolean }) {
  const searchParams = useSearchParams()
  const autoRunId    = searchParams.get("run")
  const didAutoSelect = useRef(false)

  const [runs, setRuns]               = useState<RunRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [selectedRun, setSelectedRun] = useState<RunRow | null>(null)
  const [loadingRun, setLoadingRun]   = useState(false)

  // ── Fetch ───────────────────────────────────────────────────────────────

  const fetchRuns = useCallback(async () => {
    setLoading(true)
    const filter = closed
      ? "status=in.(done,aborted)"
      : "status=not.in.(done,aborted)"
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rag_pipeline_runs` +
      `?${filter}&order=updated_at.desc&limit=100`,
      { headers: restHeaders() },
    )
    if (res.ok) setRuns(await res.json())
    setLoading(false)
  }, [closed])

  useEffect(() => { void fetchRuns() }, [fetchRuns])

  // Auto-select the run from the query param once on first load
  useEffect(() => {
    if (autoRunId && !didAutoSelect.current && !loading) {
      didAutoSelect.current = true
      void selectRun(autoRunId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRunId, loading])

  // ── Realtime list refresh ───────────────────────────────────────────────

  useEffect(() => {
    const channel = supabaseBrowser
      .channel(`runs-list-${closed ? "closed" : "open"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rag_pipeline_runs" }, (payload) => {
        const updated = payload.new as RunRow | undefined
        const removed = payload.old as { id: string } | undefined

        if (payload.eventType === "INSERT" && updated) {
          const isClosed = updated.status === "done" || updated.status === "aborted"
          if (isClosed === closed) setRuns((p) => [updated, ...p])
        } else if (payload.eventType === "UPDATE" && updated) {
          const isClosed = updated.status === "done" || updated.status === "aborted"
          setRuns((p) => {
            if (isClosed !== closed) return p.filter((r) => r.id !== updated.id)
            return [updated, ...p.filter((r) => r.id !== updated.id)]
          })
          if (updated.id === selectedRun?.id) setSelectedRun(updated)
        } else if (payload.eventType === "DELETE" && removed) {
          setRuns((p) => p.filter((r) => r.id !== removed.id))
          if (removed.id === selectedRun?.id) setSelectedRun(null)
        }
      })
      .subscribe()
    return () => { void supabaseBrowser.removeChannel(channel) }
  }, [closed, selectedRun?.id])

  // ── Select ──────────────────────────────────────────────────────────────

  async function selectRun(id: string) {
    setLoadingRun(true)
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rag_pipeline_runs?id=eq.${id}&limit=1`,
      { headers: restHeaders() },
    )
    const rows: RunRow[] = await res.json()
    setSelectedRun(rows[0] ?? null)
    setLoadingRun(false)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  // Graph view
  if (loadingRun) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem-3rem)] gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading pipeline…</span>
      </div>
    )
  }

  if (selectedRun) {
    const isRunning = selectedRun.status !== "done" && selectedRun.status !== "aborted" && selectedRun.status !== "idle"
    return (
      <div className="flex flex-col h-[calc(100vh-3.5rem-3rem)] -m-6">
        <GraphHeader run={selectedRun} onBack={() => setSelectedRun(null)} />
        <div className="flex-1 p-6 min-h-0">
          <PipelineGraphView
            nodeStatuses={selectedRun.node_statuses ?? INITIAL_STATUSES}
            requestData={selectedRun.context_payload ?? createRequestData()}
            isPipelineRunning={isRunning}
            mode="owner"
          />
        </div>
      </div>
    )
  }

  // List view
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem-3rem)] -m-6">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background shrink-0">
        <div>
          <h1 className="text-base font-semibold text-foreground">
            {closed ? "Closed Requests" : "Open Requests"}
          </h1>
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

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : runs.length === 0 ? (
          <EmptyList closed={closed} />
        ) : (
          runs.map((run) => (
            <RunCard key={run.id} run={run} onClick={() => void selectRun(run.id)} />
          ))
        )}
      </div>
    </div>
  )
}
