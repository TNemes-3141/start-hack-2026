"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { ArrowLeft, Loader2, RefreshCw, ChevronRight, GitBranch, AlertTriangle, ShieldAlert, FileDown, Braces, Trash2, Tag, Building2, MapPin, Calendar, Trophy, Clock, CheckCircle2, XCircle } from "lucide-react"
import { supabaseBrowser } from "@/lib/supabase-browser"
import { PipelineGraphView } from "@/components/pipeline-graph-view"
import { INITIAL_STATUSES, type NodeStatuses } from "@/lib/pipeline-graph"
import { createRequestData, type RequestData } from "@/lib/request-data"
import { Badge } from "@/components/ui/badge"
import { useRequestStore } from "@/lib/request-store"
import type { ShortlistEntry } from "@/lib/request-data"

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
      escalations += (stage.escalations?.filter((e) => e.blocking && !e.acknowledged).length ?? 0)
                + (stage.issues?.filter((i) => i.blocking && !i.resolved).length ?? 0)
      warnings    += (stage.escalations?.filter((e) => !e.blocking && !e.acknowledged).length ?? 0)
                + (stage.issues?.filter((i) => !i.blocking && !i.resolved).length ?? 0)
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

function RunCard({ run, onClick, onDelete }: { run: RunRow; onClick: () => void; onDelete: () => void }) {
  const [downloading, setDownloading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function deleteRun(e: React.MouseEvent) {
    e.stopPropagation()
    setDeleting(true)
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/rag_pipeline_runs?id=eq.${run.id}`, {
        method: "DELETE",
        headers: restHeaders(),
      })
      onDelete()
    } finally {
      setDeleting(false)
    }
  }

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

  const interp     = run.context_payload?.request_interpretation
  const title      = interp?.title || interp?.category_l2 || "Untitled Request"
  const catL1      = interp?.category_l1
  const catL2      = interp?.category_l2
  const budget     = interp?.budget_amount
  const currency   = interp?.currency
  const bu         = interp?.business_unit
  const country    = interp?.country
  const requiredBy = interp?.required_by_date
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
          {/* Title */}
          <div className="flex items-center gap-2.5">
            <span className={`h-2 w-2 rounded-full shrink-0 ${dot}`} />
            <p className="text-sm font-semibold text-foreground leading-snug line-clamp-1">{title}</p>
          </div>

          {/* Meta row: all items as uniform pills so height is consistent */}
          <div className="flex items-center gap-1.5 pl-4.5 flex-wrap">
            {(catL1 || catL2) && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                <Tag className="h-3 w-3 shrink-0" />{[catL1, catL2].filter(Boolean).join(" / ")}
              </span>
            )}
            {bu && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                <Building2 className="h-3 w-3 shrink-0" />{bu}
              </span>
            )}
            {country && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />{country}
              </span>
            )}
            {requiredBy && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                <Calendar className="h-3 w-3 shrink-0" />{requiredBy}
              </span>
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
        <div
          role="button"
          tabIndex={0}
          onClick={deleteRun}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") void deleteRun(e as unknown as React.MouseEvent) }}
          aria-disabled={deleting}
          title="Delete run"
          className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors aria-disabled:opacity-40 cursor-pointer"
        >
          {deleting
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Trash2 className="h-4 w-4" />}
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
  const escalations = Object.values(requestData.stages)
    .flatMap((s) => s.escalations ?? [])
    .filter((e) => !e.acknowledged)
  const issues = Object.values(requestData.stages)
    .flatMap((s) => s.issues ?? [])
    .filter((i) => !i.resolved)

  if (escalations.length === 0 && issues.length === 0) return null

  const blocking    = [
    ...escalations.filter((e) => e.blocking),
    ...issues.filter((i) => i.blocking),
  ]
  const advisory    = [
    ...escalations.filter((e) => !e.blocking),
    ...issues.filter((i) => !i.blocking),
  ]

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
        {[...blocking, ...advisory].map((item) => {
          const id        = "escalation_id" in item ? item.escalation_id : item.issue_id
          const label     = "rule" in item ? item.rule : item.issue_id
          const isBlk     = item.blocking
          return (
            <div key={id} className="flex items-start gap-3 rounded-md border bg-background px-3 py-2">
              <span className={`mt-1.25 inline-flex h-2 w-2 shrink-0 rounded-full ${isBlk ? "bg-destructive" : "bg-amber-500"}`} />
              <div className="flex-1 min-w-0 flex items-baseline gap-2 flex-wrap">
                <span className="font-mono text-[11px] font-semibold text-muted-foreground shrink-0">{label}</span>
                <span className="text-xs text-foreground leading-snug">{item.trigger}</span>
              </div>
              <span className="text-[11px] text-muted-foreground shrink-0 whitespace-nowrap">
                → <span className="font-medium text-foreground">{item.escalate_to}</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Supplier Shortlist ────────────────────────────────────────────────────────

const RANK_STYLES: Record<number, { ring: string; badge: string }> = {
  1: { ring: "ring-amber-400/50",    badge: "bg-amber-400/20 text-amber-700 dark:text-amber-300" },
  2: { ring: "ring-slate-400/50",    badge: "bg-slate-400/20 text-slate-600 dark:text-slate-400" },
  3: { ring: "ring-orange-700/40",   badge: "bg-orange-700/15 text-orange-800 dark:text-orange-400" },
}

function ScorePip({ label, value, color }: { label: string; value: number | null; color: string }) {
  if (value === null) return null
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-xs font-bold tabular-nums ${color}`}>{value}</span>
      <span className="text-[10px] text-muted-foreground leading-none">{label}</span>
    </div>
  )
}

function SupplierCard({ entry, currency }: { entry: ShortlistEntry; currency?: string }) {
  const { ring, badge } = RANK_STYLES[entry.rank] ?? { ring: "ring-border", badge: "bg-muted text-muted-foreground" }
  const score = entry.scoring_breakdown?.final_score ?? entry.ranking_score
  const cur = entry.currency ?? currency ?? ""
  const leadStatus = entry.scoring_breakdown?.lead_time_status
  const leadLabel =
    leadStatus === "expedited_only" ? `${entry.expedited_lead_time_days}d (exp.)`
    : leadStatus === "cannot_meet"  ? "Cannot meet"
    : entry.standard_lead_time_days ? `${entry.standard_lead_time_days}d`
    : "—"
  const leadColor =
    leadStatus === "cannot_meet"  ? "text-destructive"
    : leadStatus === "expedited_only" ? "text-amber-500"
    : "text-emerald-600 dark:text-emerald-400"

  return (
    <div className={`flex flex-col gap-3 rounded-xl border bg-card p-4 w-60 shrink-0 ring-1 ${ring}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${badge}`}>#{entry.rank}</span>
            {entry.preferred_supplier && (
              <span className="rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">Preferred</span>
            )}
            {entry.is_incumbent && (
              <span className="rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400">Incumbent</span>
            )}
            {entry.is_requester_preferred && !entry.preferred_supplier && (
              <span className="rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-400">Req. pref.</span>
            )}
          </div>
          <p className="text-sm font-semibold text-foreground line-clamp-1 leading-snug">{entry.supplier_name ?? entry.supplier_id}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{[entry.country_hq, entry.currency].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex flex-col items-end shrink-0 pt-1">
          <span className="text-base font-bold text-foreground tabular-nums">{score?.toFixed(1) ?? "—"}</span>
          <span className="text-[10px] text-muted-foreground leading-none">score</span>
        </div>
      </div>

      {/* Pricing */}
      <div className="rounded-lg bg-muted/50 px-3 py-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] text-muted-foreground">Total</p>
          <p className="text-sm font-bold text-foreground tabular-nums">{cur} {entry.total_price?.toLocaleString() ?? "—"}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground">Per unit</p>
          <p className="text-xs font-semibold text-foreground tabular-nums">{cur} {entry.unit_price?.toLocaleString() ?? "—"}</p>
        </div>
      </div>

      {/* Lead time + scores */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 min-w-0">
          <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className={`text-xs font-medium truncate ${leadColor}`}>{leadLabel}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <ScorePip label="Qual" value={entry.quality_score} color="text-sky-600 dark:text-sky-400" />
          <ScorePip label="Risk" value={entry.risk_score} color={(entry.risk_score ?? 0) > 50 ? "text-amber-600" : "text-emerald-600 dark:text-emerald-400"} />
          <ScorePip label="ESG" value={entry.esg_score} color="text-teal-600 dark:text-teal-400" />
        </div>
      </div>

      {/* Compliance badges */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {entry.policy_compliant
          ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" />Compliant</span>
          : <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive"><XCircle className="h-3 w-3" />Non-compliant</span>
        }
        {!entry.covers_delivery_country && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"><MapPin className="h-3 w-3" />Out of region</span>
        )}
      </div>

      {/* Recommendation note */}
      {entry.recommendation_note && (
        <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2 border-t border-border pt-2">{entry.recommendation_note}</p>
      )}
    </div>
  )
}

function SupplierShortlistSection({ shortlist, currency }: { shortlist: ShortlistEntry[]; currency?: string }) {
  if (shortlist.length === 0) return null
  return (
    <div className="shrink-0 border-t border-border bg-background/95 backdrop-blur">
      <div className="flex items-center gap-2 px-6 py-2.5 border-b border-border/50">
        <Trophy className="h-4 w-4 text-amber-500 shrink-0" />
        <span className="text-sm font-semibold">Supplier Shortlist</span>
        <span className="text-xs text-muted-foreground">{shortlist.length} candidate{shortlist.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="flex gap-4 px-6 py-4 overflow-x-auto">
        {shortlist.map((s) => (
          <SupplierCard key={s.supplier_id} entry={s} currency={currency} />
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

  const { approveAndResume, resolveIssue, acknowledgeItem } = useRequestStore()
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
  const [deletedTitle, setDeletedTitle] = useState<string | null>(null)
  const deletedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function flashDeleted(title: string) {
    if (deletedTimerRef.current) clearTimeout(deletedTimerRef.current)
    setDeletedTitle(title)
    deletedTimerRef.current = setTimeout(() => setDeletedTitle(null), 2500)
  }

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
      <div className="flex flex-col -m-6">
        <GraphHeader run={selectedRun} onBack={() => setSelectedRun(null)} />
        <EscalationInfoCard requestData={selectedRun.context_payload ?? createRequestData()} />
        <div className="p-6">
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
        <SupplierShortlistSection
          shortlist={selectedRun.context_payload?.supplier_shortlist ?? []}
          currency={selectedRun.context_payload?.request_interpretation?.currency}
        />
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

      {deletedTitle && (
        <div className="flex items-center gap-2 px-6 py-2 bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
          <Trash2 className="h-3.5 w-3.5 shrink-0" />
          <span><span className="font-medium">{deletedTitle}</span> was deleted.</span>
        </div>
      )}

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
            <RunCard key={run.id} run={run} onClick={() => void selectRun(run.id)} onDelete={() => { setAllRuns((p) => p.filter((r) => r.id !== run.id)); flashDeleted(run.context_payload?.request_interpretation?.title || run.context_payload?.request_interpretation?.category_l2 || run.id) }} />
          ))
        )}
      </div>
    </div>
  )
}
