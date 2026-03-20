"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import {
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Loader2,
  GitBranch,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  MapPin,
  Tag,
  DollarSign,
  Calendar,
  Users,
  Star,
  TrendingUp,
  FileText,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  type LucideIcon,
} from "lucide-react"
import { supabaseBrowser } from "@/lib/supabase-browser"
import { createRequestData, type RequestData, type ShortlistEntry } from "@/lib/request-data"
import { Badge } from "@/components/ui/badge"
import { useRequestStore } from "@/lib/request-store"
import type { NodeStatuses } from "@/lib/pipeline-graph"

// ── Types ──────────────────────────────────────────────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function fmtCurrency(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function getStatusMeta(status: string) {
  if (status === "done")            return { label: "Completed",         badge: "default" as const,     color: "text-emerald-600" }
  if (status === "aborted")         return { label: "Aborted",           badge: "destructive" as const, color: "text-red-600" }
  if (status === "blocked")         return { label: "Approval Required", badge: "destructive" as const, color: "text-amber-600" }
  if (status === "idle")            return { label: "Idle",              badge: "outline" as const,     color: "text-muted-foreground" }
  if (status.endsWith("_active"))   return { label: "Running",           badge: "secondary" as const,   color: "text-blue-600" }
  if (status.endsWith("_complete")) return { label: "In Progress",       badge: "secondary" as const,   color: "text-sky-600" }
  return                                   { label: status,              badge: "outline" as const,     color: "text-muted-foreground" }
}

const STAGE_LABELS: Record<string, string> = {
  translation: "Translation",
  internal_coherence: "Internal Coherence",
  missing_required_data: "Missing Required Data",
  check_available_products: "Available Products",
  inappropriate_requests: "Request Validation",
  apply_category_rules: "Category Rules",
  approval_tier: "Approval Tier",
  precedence_lookup: "Precedence Lookup",
  purely_eligible_suppliers: "Eligible Suppliers",
  restricted_suppliers: "Restricted Suppliers",
  geographical_rules: "Geography Rules",
  evaluate_preferred_supplier: "Preferred Supplier",
  apply_dynamic_category_rules: "Dynamic Category Rules",
  pricing_calculation: "Pricing",
  reevaluate_tier_from_quote: "Tier Re-evaluation",
  scoring_and_ranking: "Scoring & Ranking",
  final_check: "Final Check",
}

function matchesTargets(escalateTo: string | undefined, targets: string[], excludeTargets: string[]): boolean {
  const lower = escalateTo?.toLowerCase() ?? ""
  if (!lower) return false
  if (excludeTargets.some((x) => lower.includes(x.toLowerCase()))) return false
  if (targets.length === 0) return true
  return targets.some((t) => lower.includes(t.toLowerCase()))
}

function runHasEscalationFor(run: RunRow, targets: string[], excludeTargets: string[] = []): boolean {
  if (run.status === "done" || run.status === "aborted") return false
  if (!run.context_payload?.stages) return false
  for (const stage of Object.values(run.context_payload.stages)) {
    for (const e of stage.escalations ?? []) {
      if (e.acknowledged) continue
      if (matchesTargets(e.escalate_to, targets, excludeTargets)) return true
    }
    for (const i of stage.issues ?? []) {
      if (i.resolved) continue
      if (matchesTargets(i.escalate_to, targets, excludeTargets)) return true
    }
  }
  return false
}

function getRoleEscalations(run: RunRow, targets: string[], excludeTargets: string[] = []) {
  const result: { stageKey: string; stageLabel: string; rule?: string; trigger: string; escalate_to: string; blocking: boolean; itemId: string; itemType: "escalation" | "issue" }[] = []
  if (!run.context_payload?.stages) return result
  for (const [stageKey, stage] of Object.entries(run.context_payload.stages)) {
    for (const e of stage.escalations ?? []) {
      if (e.acknowledged) continue
      if (matchesTargets(e.escalate_to, targets, excludeTargets)) {
        result.push({ stageKey, stageLabel: STAGE_LABELS[stageKey] ?? stageKey, rule: e.rule, trigger: e.trigger, escalate_to: e.escalate_to, blocking: e.blocking, itemId: e.escalation_id, itemType: "escalation" })
      }
    }
    for (const i of stage.issues ?? []) {
      if (i.resolved) continue
      if (matchesTargets(i.escalate_to, targets, excludeTargets)) {
        result.push({ stageKey, stageLabel: STAGE_LABELS[stageKey] ?? stageKey, trigger: i.trigger, escalate_to: i.escalate_to, blocking: i.blocking, itemId: i.issue_id, itemType: "issue" })
      }
    }
  }
  return result
}

function getAllReasonings(run: RunRow) {
  const result: { stageKey: string; stageLabel: string; aspect: string; reasoning: string }[] = []
  if (!run.context_payload?.stages) return result
  for (const [stageKey, stage] of Object.entries(run.context_payload.stages)) {
    for (const r of stage.reasonings ?? []) {
      result.push({ stageKey, stageLabel: STAGE_LABELS[stageKey] ?? stageKey, aspect: r.aspect, reasoning: r.reasoning })
    }
  }
  return result
}

function getAllPolicyViolations(run: RunRow) {
  const result: { stageKey: string; stageLabel: string; policy: string; description?: string }[] = []
  if (!run.context_payload?.stages) return result
  for (const [stageKey, stage] of Object.entries(run.context_payload.stages)) {
    for (const v of stage.policy_violations ?? []) {
      result.push({ stageKey, stageLabel: STAGE_LABELS[stageKey] ?? stageKey, policy: v.policy, description: v.description })
    }
  }
  return result
}

// ── Score bar ──────────────────────────────────────────────────────────────────

function ScoreBar({ value, max = 100, color = "bg-emerald-500" }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">{Math.round(value)}</span>
    </div>
  )
}

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children, defaultOpen = true }: {
  title: string
  icon: LucideIcon
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  )
}

// ── Escalation Report Card ─────────────────────────────────────────────────────

function EscalationReportCard({
  run,
  targets,
  excludeTargets = [],
  roleLabel,
  onAbort,
}: {
  run: RunRow
  targets: string[]
  excludeTargets?: string[]
  roleLabel: string
  onAbort: (runId: string) => void
}) {
  const { approveAndResume, acknowledgeItem } = useRequestStore()
  const [resolving, setResolving]       = useState(false)
  const [aborting, setAborting]         = useState(false)
  const [acknowledging, setAcknowledging] = useState<string | null>(null)

  const data = run.context_payload ?? createRequestData()
  const interp = data.request_interpretation
  const tier = data.approval_tier
  const shortlist = data.supplier_shortlist ?? []
  const excluded = data.suppliers_excluded ?? []
  const recommendation = data.recommendation
  const audit = data.audit_trail

  const myEscalations = getRoleEscalations(run, targets, excludeTargets)
  const allReasonings = getAllReasonings(run)
  const policyViolations = getAllPolicyViolations(run)

  const title = interp?.title || interp?.category_l2 || "Untitled Request"
  const { label: statusLabel, badge: statusBadge } = getStatusMeta(run.status)

  async function handleResolve() {
    setResolving(true)
    try {
      if (run.status === "final_check_complete" || run.status === "done") {
        // Pipeline already finished — just stamp as approved
        await fetch(`/api/runs/${run.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "approved", last_heartbeat_at: new Date().toISOString() }),
        })
      } else {
        await approveAndResume(run.id, data, roleLabel)
      }
    } finally {
      setResolving(false)
    }
  }

  async function handleAbort() {
    setAborting(true)
    try {
      const res = await fetch(`/api/runs/${run.id}`, { method: "DELETE" })
      if (res.ok) onAbort(run.id)
    } finally {
      setAborting(false)
    }
  }

  const actionBusy = resolving || aborting
  const isFinalApproval = run.status === "final_check_complete" || run.status === "done"

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* ── Card header ── */}
      <div className={`px-6 py-4 border-b border-border ${isFinalApproval ? "bg-amber-500/5" : "bg-destructive/5"}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {isFinalApproval
                ? <CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0" />
                : <ShieldAlert className="h-4 w-4 text-destructive shrink-0" />}
              <span className={`text-xs font-semibold uppercase tracking-wide ${isFinalApproval ? "text-amber-600" : "text-destructive"}`}>
                {isFinalApproval ? `Awaiting Approval — ${roleLabel}` : `Escalated to ${roleLabel}`}
              </span>
            </div>
            <h2 className="text-base font-semibold text-foreground leading-snug">{title}</h2>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className="text-xs text-muted-foreground">{run.id.slice(0, 8)}</span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">{timeAgo(run.updated_at ?? run.created_at)}</span>
              {myEscalations.length > 0 && (
                <>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs font-medium text-destructive">
                    {myEscalations.length} escalation{myEscalations.length > 1 ? "s" : ""} requiring attention
                  </span>
                </>
              )}
            </div>
          </div>
          <Badge variant={statusBadge} className="text-[10px] shrink-0">{statusLabel}</Badge>
        </div>
      </div>

      <div className="p-6 flex flex-col gap-4">

        {/* ── Escalation triggers with per-row actions ── */}
        <Section title="Escalation Triggers" icon={ShieldAlert} defaultOpen={true}>
          {myEscalations.length === 0 ? (
            <p className="text-xs text-muted-foreground">No escalations targeted at your role found.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {myEscalations.map((e, i) => (
                <div key={i} className={`rounded-md border px-3 py-2.5 ${e.blocking ? "border-destructive/20 bg-destructive/5" : "border-amber-500/20 bg-amber-500/5"}`}>
                  <div className="flex items-start gap-3">
                    <ShieldAlert className={`h-4 w-4 shrink-0 mt-0.5 ${e.blocking ? "text-destructive" : "text-amber-500"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        {e.rule && (
                          <span className="font-mono text-[11px] font-semibold bg-muted rounded px-1.5 py-0.5 text-muted-foreground">{e.rule}</span>
                        )}
                        <span className="text-[11px] text-muted-foreground">{e.stageLabel}</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${e.blocking ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>
                          {e.blocking ? "Blocking" : "Advisory"}
                        </span>
                      </div>
                      <p className="text-sm text-foreground leading-snug">{e.trigger}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Target: <span className="font-medium text-foreground">{e.escalate_to}</span></p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-2 mt-3 pt-2.5 border-t ${e.blocking ? "border-destructive/10" : "border-amber-500/10"}`}>
                    {e.blocking ? (
                      <>
                        {i === 0 && (
                          <>
                            <button
                              onClick={handleResolve}
                              disabled={actionBusy}
                              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                            >
                              {resolving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CircleCheck className="h-3.5 w-3.5" />}
                              {resolving ? "Resolving…" : "Resolve & Resume"}
                            </button>
                            <button
                              onClick={handleAbort}
                              disabled={actionBusy}
                              className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20 disabled:opacity-50 transition-colors"
                            >
                              {aborting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                              {aborting ? "Aborting…" : "Abort"}
                            </button>
                            <span className="text-[11px] text-muted-foreground ml-1">
                              Resolve resumes the pipeline · Abort permanently deletes this request
                            </span>
                          </>
                        )}
                      </>
                    ) : (
                      <button
                        onClick={async () => {
                          setAcknowledging(e.itemId)
                          try { await acknowledgeItem(run.id, data, e.stageKey, e.itemType, e.itemId) }
                          finally { setAcknowledging(null) }
                        }}
                        disabled={acknowledging === e.itemId || actionBusy}
                        className="flex items-center gap-1.5 rounded-md border border-muted-foreground/30 bg-muted/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors"
                      >
                        {acknowledging === e.itemId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CircleCheck className="h-3.5 w-3.5" />}
                        {acknowledging === e.itemId ? "Acknowledging…" : "Acknowledge"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── Request details ── */}
        <Section title="Request Details" icon={FileText} defaultOpen={true}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {interp?.category_l1 && (
              <div className="flex items-start gap-2">
                <Tag className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Category</p>
                  <p className="text-sm font-medium">{[interp.category_l1, interp.category_l2].filter(Boolean).join(" / ")}</p>
                </div>
              </div>
            )}
            {interp?.business_unit && (
              <div className="flex items-start gap-2">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Business Unit</p>
                  <p className="text-sm font-medium">{interp.business_unit}</p>
                </div>
              </div>
            )}
            {interp?.country && (
              <div className="flex items-start gap-2">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Country</p>
                  <p className="text-sm font-medium">{interp.country}</p>
                </div>
              </div>
            )}
            {interp?.budget_amount != null && interp?.currency && (
              <div className="flex items-start gap-2">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Budget</p>
                  <p className="text-sm font-semibold">{fmtCurrency(interp.budget_amount, interp.currency)}</p>
                </div>
              </div>
            )}
            {interp?.quantity != null && (
              <div className="flex items-start gap-2">
                <Tag className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Quantity</p>
                  <p className="text-sm font-medium">{interp.quantity}{interp.unit_of_measure ? ` ${interp.unit_of_measure}` : ""}</p>
                </div>
              </div>
            )}
            {interp?.required_by_date && (
              <div className="flex items-start gap-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Required By</p>
                  <p className="text-sm font-medium">{interp.required_by_date}</p>
                </div>
              </div>
            )}
            {interp?.requester_id && (
              <div className="flex items-start gap-2">
                <Users className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Requester</p>
                  <p className="text-sm font-medium">{interp.requester_id}{interp.requester_role ? ` (${interp.requester_role})` : ""}</p>
                </div>
              </div>
            )}
            {interp?.preferred_supplier_mentioned && (
              <div className="flex items-start gap-2">
                <Star className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Preferred Supplier</p>
                  <p className="text-sm font-medium">{interp.preferred_supplier_mentioned}</p>
                </div>
              </div>
            )}
            {interp?.contract_type_requested && (
              <div className="flex items-start gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Contract Type</p>
                  <p className="text-sm font-medium">{interp.contract_type_requested}</p>
                </div>
              </div>
            )}
          </div>
          {interp?.request_text && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Original Request</p>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{interp.request_text}</p>
            </div>
          )}
          {(interp?.delivery_countries ?? []).length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Delivery Countries</p>
              <div className="flex flex-wrap gap-1.5">
                {(interp!.delivery_countries ?? []).map((c) => (
                  <span key={c} className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{c}</span>
                ))}
              </div>
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-2">
            {interp?.esg_requirement && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" /> ESG Requirement
              </span>
            )}
            {interp?.data_residency_required && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400">
                <CheckCircle2 className="h-3 w-3" /> Data Residency Required
              </span>
            )}
            {interp?.fast_track_eligible && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                <CheckCircle2 className="h-3 w-3" /> Fast Track Eligible
              </span>
            )}
          </div>
        </Section>

        {/* ── Approval tier ── */}
        {tier && (
          <Section title="Approval Tier" icon={TrendingUp} defaultOpen={true}>
            <div className="flex items-start gap-4 flex-wrap">
              <div className="flex items-center justify-center h-12 w-12 rounded-xl border-2 border-primary/30 bg-primary/5 shrink-0">
                <span className="text-lg font-bold text-primary">T{tier.tier_number}</span>
              </div>
              <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Budget Threshold</p>
                  <p className="text-sm font-semibold">{fmtCurrency(tier.budget_amount, tier.currency)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Min. Quotes Required</p>
                  <p className="text-sm font-semibold">{tier.min_supplier_quotes}</p>
                </div>
                {tier.is_boundary_case && tier.boundary_value != null && (
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Boundary Value</p>
                    <p className="text-sm font-semibold text-amber-600">{fmtCurrency(tier.boundary_value, tier.currency)} ⚠ Borderline</p>
                  </div>
                )}
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Approvers</p>
                  <p className="text-sm font-medium">{tier.approvers.join(", ")}</p>
                </div>
                {tier.deviation_approval_required_from.length > 0 && (
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Deviation Approval From</p>
                    <p className="text-sm font-medium">{tier.deviation_approval_required_from.join(", ")}</p>
                  </div>
                )}
              </div>
            </div>
          </Section>
        )}

        {/* ── Supplier shortlist ── */}
        {shortlist.length > 0 && (
          <Section title={`Supplier Shortlist (${shortlist.length})`} icon={Star} defaultOpen={true}>
            <div className="flex flex-col gap-3">
              {shortlist.map((s: ShortlistEntry) => (
                <div
                  key={s.supplier_id}
                  className={`rounded-lg border p-3 ${s.rank === 1 ? "border-emerald-500/30 bg-emerald-500/5" : "border-border"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${s.rank === 1 ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}`}>
                        {s.rank}
                      </div>
                      <div>
                        <p className="text-sm font-semibold leading-snug">{s.supplier_name ?? s.supplier_id}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {s.preferred_supplier && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                              <Star className="h-2.5 w-2.5" /> Preferred
                            </span>
                          )}
                          {s.is_incumbent && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                              Incumbent
                            </span>
                          )}
                          {s.is_requester_preferred && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-600">
                              Requester Choice
                            </span>
                          )}
                          {!s.policy_compliant && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                              <XCircle className="h-2.5 w-2.5" /> Non-compliant
                            </span>
                          )}
                          {s.country_hq && (
                            <span className="text-[10px] text-muted-foreground">{s.country_hq}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold tabular-nums">{s.currency ? fmtCurrency(s.total_price, s.currency) : `—`}</p>
                      <p className="text-[11px] text-muted-foreground">{s.unit_price ? `${s.currency} ${s.unit_price.toLocaleString()} / unit` : ""}</p>
                    </div>
                  </div>
                  <div className="mt-2.5 grid grid-cols-3 gap-x-4 gap-y-1">
                    {s.quality_score != null && (
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5">Quality</p>
                        <ScoreBar value={s.quality_score} color="bg-emerald-500" />
                      </div>
                    )}
                    {s.risk_score != null && (
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5">Risk (lower better)</p>
                        <ScoreBar value={100 - s.risk_score} color="bg-blue-500" />
                      </div>
                    )}
                    {s.esg_score != null && (
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5">ESG</p>
                        <ScoreBar value={s.esg_score} color="bg-teal-500" />
                      </div>
                    )}
                  </div>
                  {s.ranking_score > 0 && (
                    <div className="mt-1.5">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Composite Score</p>
                      <ScoreBar value={s.ranking_score} color={s.rank === 1 ? "bg-emerald-500" : "bg-muted-foreground"} />
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
                    {s.standard_lead_time_days > 0 && (
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {s.standard_lead_time_days}d standard lead</span>
                    )}
                    {s.expedited_lead_time_days > 0 && (
                      <span>/ {s.expedited_lead_time_days}d expedited</span>
                    )}
                    {s.pricing_tier_applied && (
                      <span>Tier: {s.pricing_tier_applied}</span>
                    )}
                  </div>
                  {s.recommendation_note && (
                    <p className="mt-1.5 text-xs text-muted-foreground italic">{s.recommendation_note}</p>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── Excluded suppliers ── */}
        {excluded.length > 0 && (
          <Section title={`Excluded Suppliers (${excluded.length})`} icon={XCircle} defaultOpen={false}>
            <div className="flex flex-col gap-2">
              {excluded.map((s, i) => (
                <div key={i} className="flex items-start gap-2.5 rounded-md border border-border px-3 py-2">
                  <XCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{s.supplier_name ?? s.supplier_id}</p>
                    <p className="text-xs text-muted-foreground">{s.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── Policy violations ── */}
        {policyViolations.length > 0 && (
          <Section title={`Policy Violations (${policyViolations.length})`} icon={AlertTriangle} defaultOpen={true}>
            <div className="flex flex-col gap-2">
              {policyViolations.map((v, i) => (
                <div key={i} className="flex items-start gap-2.5 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[11px] font-semibold text-muted-foreground">{v.stageLabel}</span>
                    </div>
                    <p className="text-sm font-medium">{v.policy}</p>
                    {v.description && <p className="text-xs text-muted-foreground mt-0.5">{v.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── Recommendation ── */}
        {recommendation?.status && (
          <Section title="System Recommendation" icon={CheckCircle2} defaultOpen={true}>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                  recommendation.status === "approved" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" :
                  recommendation.status === "blocked" || recommendation.status === "escalated" ? "bg-destructive/10 text-destructive" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {recommendation.status.toUpperCase()}
                </span>
              </div>
              {recommendation.reason && (
                <p className="text-sm text-foreground leading-relaxed">{recommendation.reason}</p>
              )}
              {recommendation.preferred_supplier_if_resolved && (
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Preferred Supplier (if resolved)</p>
                  <p className="text-sm font-medium">{recommendation.preferred_supplier_if_resolved}</p>
                  {recommendation.preferred_supplier_rationale && (
                    <p className="text-xs text-muted-foreground mt-0.5">{recommendation.preferred_supplier_rationale}</p>
                  )}
                </div>
              )}
              {recommendation.minimum_budget_required > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Minimum Budget Required:</span>
                  <span className="text-sm font-semibold">{fmtCurrency(recommendation.minimum_budget_required, recommendation.minimum_budget_currency)}</span>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* ── Pipeline reasoning ── */}
        {allReasonings.length > 0 && (
          <Section title={`Pipeline Reasoning (${allReasonings.length} steps)`} icon={GitBranch} defaultOpen={false}>
            <div className="flex flex-col gap-2">
              {allReasonings.map((r, i) => (
                <div key={i} className="rounded-md border border-border px-3 py-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-semibold bg-muted rounded px-1.5 py-0.5 text-muted-foreground">{r.stageLabel}</span>
                    <span className="text-xs font-medium text-foreground">{r.aspect}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{r.reasoning}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── Audit trail ── */}
        {audit && (audit.policies_checked?.length > 0 || audit.supplier_ids_evaluated?.length > 0) && (
          <Section title="Audit Trail" icon={FileText} defaultOpen={false}>
            <div className="flex flex-col gap-3">
              {audit.policies_checked?.length > 0 && (
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1.5">Policies Checked ({audit.policies_checked.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {audit.policies_checked.map((p, i) => (
                      <span key={i} className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{p}</span>
                    ))}
                  </div>
                </div>
              )}
              {audit.supplier_ids_evaluated?.length > 0 && (
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1.5">Suppliers Evaluated ({audit.supplier_ids_evaluated.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {audit.supplier_ids_evaluated.map((s, i) => (
                      <span key={i} className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-mono text-muted-foreground">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {audit.pricing_tiers_applied && (
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Pricing Tiers Applied</p>
                  <p className="text-sm text-foreground">{audit.pricing_tiers_applied}</p>
                </div>
              )}
              {audit.data_sources_used?.length > 0 && (
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1.5">Data Sources</p>
                  <div className="flex flex-wrap gap-1.5">
                    {audit.data_sources_used.map((s, i) => (
                      <span key={i} className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {audit.historical_award_note && (
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Historical Context</p>
                  <p className="text-xs text-muted-foreground">{audit.historical_award_note}</p>
                </div>
              )}
            </div>
          </Section>
        )}

      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function EscalationReportPage({
  escalateTo,
  excludeTargets = [],
  roleLabel,
}: {
  escalateTo: string[]
  excludeTargets?: string[]
  roleLabel: string
}) {
  const [allRuns, setAllRuns] = useState<RunRow[]>([])
  const [loading, setLoading] = useState(true)

  const escalateToRef = useRef(escalateTo)
  useEffect(() => { escalateToRef.current = escalateTo }, [escalateTo])

  const runs = allRuns.filter((r) => runHasEscalationFor(r, escalateTo, excludeTargets))

  function handleAbort(runId: string) {
    setAllRuns((prev) => prev.filter((r) => r.id !== runId))
  }

  const fetchRuns = useCallback(async () => {
    setLoading(true)
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/rag_pipeline_runs?order=updated_at.desc&limit=200`,
      { headers: restHeaders() },
    )
    if (res.ok) setAllRuns(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { void fetchRuns() }, [fetchRuns])

  // Realtime updates
  useEffect(() => {
    const channel = supabaseBrowser
      .channel("escalation-report-runs")
      .on("postgres_changes", { event: "*", schema: "public", table: "rag_pipeline_runs" }, (payload) => {
        const updated = payload.new as RunRow | undefined
        const removed = payload.old as { id: string } | undefined
        if (payload.eventType === "INSERT" && updated) {
          setAllRuns((p) => [updated, ...p])
        } else if (payload.eventType === "UPDATE" && updated) {
          setAllRuns((prev) => {
            const exists = prev.some((r) => r.id === updated.id)
            if (exists) return prev.map((r) => r.id === updated.id ? updated : r)
            return [updated, ...prev]
          })
        } else if (payload.eventType === "DELETE" && removed) {
          setAllRuns((p) => p.filter((r) => r.id !== removed.id))
        }
      })
      .subscribe()
    return () => { void supabaseBrowser.removeChannel(channel) }
  }, [])

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem-3rem)] -m-6">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background shrink-0">
        <div>
          <h1 className="text-base font-semibold text-foreground">My Escalations</h1>
          {!loading && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {runs.length} escalated request{runs.length !== 1 ? "s" : ""} requiring your attention
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading escalations…</span>
          </div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted">
              <GitBranch className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No escalations</p>
            <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
              No requests have been escalated to your role yet.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6 max-w-4xl mx-auto">
            {runs.map((run) => (
              <EscalationReportCard
                key={run.id}
                run={run}
                targets={escalateTo}
                excludeTargets={excludeTargets}
                roleLabel={roleLabel}
                onAbort={handleAbort}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
