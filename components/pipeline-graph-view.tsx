"use client"

import { useCallback, useMemo, useEffect, useRef, useState } from "react"
import { useTheme } from "next-themes"
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeMouseHandler,
  type NodeProps,
  type NodeTypes,
  type ReactFlowInstance,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import {
  Clock,
  Loader2,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  ShieldAlert,
  TriangleAlert,
  Info,
  Ban,
  FileText,
  Eye,
  ThumbsUp,
  UserCheck,
  CheckCheck,
} from "lucide-react"
import type { PipelineNodeStatus, NodeStatuses } from "@/lib/pipeline-graph"
import type { OrchestratorMode } from "@/hooks/use-rag-orchestrator"
import type { RequestData } from "@/lib/request-data"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

// ── Types ────────────────────────────────────────────────────────────────────

type NodeId =
  | "request-submitted" | "translation" | "internal-coherence"
  | "missing-required-data" | "check-available-products" | "inappropriate-requests"
  | "apply-cat-rules-1" | "approval-tier" | "precedence-lookup"
  | "purely-eligible-suppliers" | "restricted-suppliers" | "geographical-rules"
  | "evaluate-preferred-supplier" | "apply-cat-rules-2" | "pricing-calculation"
  | "re-evaluate-tier" | "scoring-ranking" | "final-check" | "done"

// ── Elapsed timer ────────────────────────────────────────────────────────────

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(Date.now() - startedAt)
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 1000)
    return () => clearInterval(id)
  }, [startedAt])
  const totalSeconds = Math.floor(elapsed / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return (
    <span className="text-xs tabular-nums text-muted-foreground">
      {String(minutes).padStart(2, "0")}m {String(seconds).padStart(2, "0")}s
    </span>
  )
}

// ── Status node ───────────────────────────────────────────────────────────────

export const statusConfig: Record<PipelineNodeStatus, { icon: React.ReactNode; border: string }> = {
  outstanding: { icon: <Clock className="h-4 w-4 text-muted-foreground" />, border: "border-border" },
  working:     { icon: <Loader2 className="h-4 w-4 animate-spin text-sky-600 dark:text-sky-400" />, border: "border-sky-600/60 dark:border-sky-400/60" },
  warning:     { icon: <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />, border: "border-amber-600/60 dark:border-amber-400/60" },
  escalation:  { icon: <XCircle className="h-4 w-4 text-destructive" />, border: "border-destructive/70" },
  done:        { icon: <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />, border: "border-emerald-600/60 dark:border-emerald-400/60" },
}

function StatusNode({ data }: NodeProps) {
  const status    = (data.status    as PipelineNodeStatus) ?? "outstanding"
  const startedAt = data.startedAt  as number | undefined
  const { icon, border } = statusConfig[status]
  return (
    <div
      className={`rounded-md border-2 bg-card text-card-foreground px-3 py-2 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${border}`}
      style={{ width: NODE_W }}
    >
      <Handle type="target" position={Position.Top} className="bg-border! border-border!" />
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{data.label as string}</span>
        {icon}
      </div>
      {status === "working" && startedAt !== undefined && (
        <div className="mt-1"><ElapsedTimer startedAt={startedAt} /></div>
      )}
      <Handle type="source" position={Position.Bottom} className="bg-border! border-border!" />
    </div>
  )
}

function GroupBoxNode({ data }: NodeProps) {
  const label = data.label as string | undefined
  return (
    <div
      className="relative rounded-lg border-2 border-dashed border-border bg-muted/30 pointer-events-none overflow-visible"
      style={{ width: data.width as number, height: data.height as number }}
    >
      {label && (
        <span className="absolute -top-6 left-0 text-[11px] font-semibold text-foreground/60 uppercase tracking-widest select-none whitespace-nowrap">
          {label}
        </span>
      )}
    </div>
  )
}

const nodeTypes: NodeTypes = { status: StatusNode, "group-box": GroupBoxNode }

// ── Layout constants ──────────────────────────────────────────────────────────

const NODE_W  = 280  // StatusNode width (matches style={{ width: NODE_W }})
const NODE_H  = 44   // Approximate rendered height of a StatusNode
const BOX_PAD = 16   // Padding on every side between box border and node edges

const gbProps = { type: "group-box", selectable: false, draggable: false, focusable: false, className: "pointer-events-none" } as const

// ── Status-node positions (single source of truth) ────────────────────────────

const snPos: Record<string, { x: number; y: number }> = {
  "request-submitted":           { x: 200, y: 0    },
  "translation":                 { x: 50,  y: 140  },
  "internal-coherence":          { x: 360, y: 140  },
  "missing-required-data":       { x: 360, y: 260  },
  "check-available-products":    { x: 360, y: 380  },
  "inappropriate-requests":      { x: 200, y: 520  },
  "apply-cat-rules-1":           { x: 50,  y: 660  },
  "precedence-lookup":           { x: 360, y: 660  },
  "approval-tier":               { x: 360, y: 780  },
  "purely-eligible-suppliers":   { x: 200, y: 920  },
  "restricted-suppliers":        { x: 50,  y: 1060 },
  "geographical-rules":          { x: 50,  y: 1180 },
  "evaluate-preferred-supplier": { x: 360, y: 1060 },
  "apply-cat-rules-2":           { x: 200, y: 1320 },
  "pricing-calculation":         { x: 200, y: 1460 },
  "re-evaluate-tier":            { x: 200, y: 1580 },
  "scoring-ranking":             { x: 200, y: 1720 },
  "final-check":                 { x: 200, y: 1860 },
  "done":                        { x: 200, y: 2000 },
}

// ── Group definitions ─────────────────────────────────────────────────────────

const groupDefs: { id: string; label: string; members: string[] }[] = [
  { id: "group-box-1", label: "Input Analysis",            members: ["translation","internal-coherence","missing-required-data","check-available-products"] },
  { id: "group-box-2", label: "Inappropriate Requests",    members: ["inappropriate-requests"] },
  { id: "group-box-3", label: "Category Rules & Approval", members: ["apply-cat-rules-1","precedence-lookup","approval-tier"] },
  { id: "group-box-4", label: "Purely Eligible Suppliers", members: ["purely-eligible-suppliers"] },
  { id: "group-box-5", label: "Supplier Filtering",        members: ["restricted-suppliers","geographical-rules","evaluate-preferred-supplier"] },
  { id: "group-box-6", label: "Dynamic Category Rules",    members: ["apply-cat-rules-2"] },
  { id: "group-box-7", label: "Pricing",                   members: ["pricing-calculation","re-evaluate-tier"] },
  { id: "group-box-8", label: "Scoring & Ranking",         members: ["scoring-ranking"] },
  { id: "group-box-9", label: "Final Check",               members: ["final-check"] },
]

function computeGroupBox(members: string[]) {
  const xs = members.flatMap(id => [snPos[id].x, snPos[id].x + NODE_W])
  const ys = members.flatMap(id => [snPos[id].y, snPos[id].y + NODE_H])
  const x = Math.min(...xs) - BOX_PAD
  const y = Math.min(...ys) - BOX_PAD
  return { x, y, width: Math.max(...xs) + BOX_PAD - x, height: Math.max(...ys) + 2 * BOX_PAD + 8 - y }
}

const groupBoxLayout = Object.fromEntries(groupDefs.map(g => [g.id, computeGroupBox(g.members)]))
const groupBoxData: Record<string, { label: string; width: number; height: number }> = Object.fromEntries(
  groupDefs.map(g => [g.id, { label: g.label, ...groupBoxLayout[g.id] }])
)

// ── Node definitions (group boxes first = render behind status nodes) ─────────

const nodeLabels: Record<NodeId, string> = {
  "request-submitted":          "Request Submitted",
  "translation":                "Translation",
  "internal-coherence":         "Internal Coherence",
  "missing-required-data":      "Missing Required Data",
  "check-available-products":   "Check Available Products",
  "inappropriate-requests":     "Inappropriate Requests",
  "apply-cat-rules-1":          "Apply Category Rules",
  "approval-tier":              "Approval Tier",
  "precedence-lookup":          "Precedence Lookup",
  "purely-eligible-suppliers":  "Purely Eligible Suppliers",
  "restricted-suppliers":       "Restricted Suppliers",
  "geographical-rules":         "Geographical Rules",
  "evaluate-preferred-supplier":"Evaluate Preferred Supplier",
  "apply-cat-rules-2":          "Apply Dynamic Category Rules",
  "pricing-calculation":        "Pricing Calculation",
  "re-evaluate-tier":           "Re-evaluate Tier from Quote",
  "scoring-ranking":            "Scoring and Ranking",
  "final-check":                "Final Check",
  "done":                       "Done",
}

const nodeDefinitions: Omit<Node, "data">[] = [
  { id: "request-submitted", type: "status", position: snPos["request-submitted"] },
  ...groupDefs.flatMap(g => [
    { id: g.id, ...gbProps, position: { x: groupBoxLayout[g.id].x, y: groupBoxLayout[g.id].y } },
    ...g.members.map(id => ({ id, type: "status", position: snPos[id] })),
  ]),
  { id: "done", type: "status", position: snPos["done"] },
]

const edges: Edge[] = [
  { id: "e-rs-tr",    source: "request-submitted",         target: "translation" },
  { id: "e-rs-ic",    source: "request-submitted",         target: "internal-coherence" },
  { id: "e-ic-mrd",   source: "internal-coherence",        target: "missing-required-data" },
  { id: "e-mrd-cap",  source: "missing-required-data",     target: "check-available-products" },
  { id: "e-tr-ir",    source: "translation",               target: "inappropriate-requests" },
  { id: "e-cap-ir",   source: "check-available-products",  target: "inappropriate-requests" },
  { id: "e-ir-acr1",  source: "inappropriate-requests",    target: "apply-cat-rules-1" },
  { id: "e-ir-pl",    source: "inappropriate-requests",    target: "precedence-lookup" },
  { id: "e-pl-at",    source: "precedence-lookup",         target: "approval-tier" },
  { id: "e-acr1-pes", source: "apply-cat-rules-1",         target: "purely-eligible-suppliers" },
  { id: "e-at-pes",   source: "approval-tier",             target: "purely-eligible-suppliers" },
  { id: "e-pes-rs",   source: "purely-eligible-suppliers",   target: "restricted-suppliers" },
  { id: "e-pes-eps",  source: "purely-eligible-suppliers",   target: "evaluate-preferred-supplier" },
  { id: "e-rs-gr",    source: "restricted-suppliers",        target: "geographical-rules" },
  { id: "e-gr-acr2",  source: "geographical-rules",          target: "apply-cat-rules-2" },
  { id: "e-eps-acr2", source: "evaluate-preferred-supplier", target: "apply-cat-rules-2" },
  { id: "e-acr2-pc",  source: "apply-cat-rules-2",         target: "pricing-calculation" },
  { id: "e-pc-ret",   source: "pricing-calculation",       target: "re-evaluate-tier" },
  { id: "e-ret-sr",   source: "re-evaluate-tier",          target: "scoring-ranking" },
  { id: "e-sr-fc",    source: "scoring-ranking",           target: "final-check" },
  { id: "e-fc-done",  source: "final-check",               target: "done" },
]

// ── Node detail panel ─────────────────────────────────────────────────────────

const nodeToStageId: Partial<Record<NodeId, string>> = {
  "translation":               "translation",
  "internal-coherence":        "internal_coherence",
  "missing-required-data":     "missing_required_data",
  "check-available-products":  "check_available_products",
  "inappropriate-requests":    "inappropriate_requests",
  "apply-cat-rules-1":         "apply_category_rules",
  "apply-cat-rules-2":         "apply_category_rules",
  "approval-tier":             "approval_tier",
  "precedence-lookup":         "precedence_lookup",
  "purely-eligible-suppliers": "purely_eligible_suppliers",
  "restricted-suppliers":        "restricted_suppliers",
  "geographical-rules":          "geographical_rules",
  "evaluate-preferred-supplier": "evaluate_preferred_supplier",
  "pricing-calculation":         "pricing_calculation",
  "re-evaluate-tier":          "reevaluate_tier_from_quote",
  "scoring-ranking":           "scoring_and_ranking",
  "final-check":               "final_check",
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      {icon}
      <span className="text-sm font-semibold text-foreground">{title}</span>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return <p className="text-xs text-muted-foreground italic">{label}</p>
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <span className="font-medium text-foreground shrink-0">{label}:</span>
      <span className="text-muted-foreground wrap-break-word">{value}</span>
    </div>
  )
}

function IssueCard({ issue, onResolve }: { issue: import("@/lib/request-data").Issue; onResolve?: (issueId: string) => Promise<void> }) {
  const [resolving, setResolving] = useState(false)
  const isResolved = issue.resolved === true
  const isBlocking = issue.blocking && !isResolved

  const severityClass =
    issue.severity === "critical" ? "bg-destructive text-destructive-foreground" :
    issue.severity === "high"     ? "bg-orange-500 text-white" :
    issue.severity === "middle"   ? "bg-amber-500 text-white" : ""

  return (
    <div className={`rounded-md border px-3 py-2.5 ${isResolved ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
      {/* Header row: severity + status badges */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="secondary" className={`text-[10px] capitalize ${severityClass}`}>{issue.severity}</Badge>
          {isResolved
            ? <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600 gap-1"><CheckCheck className="h-2.5 w-2.5" />Resolved</Badge>
            : isBlocking && <Badge className="text-[10px] bg-amber-600 hover:bg-amber-600">Blocking</Badge>
          }
        </div>
        <span className="text-[10px] font-mono text-muted-foreground shrink-0">{issue.issue_id}</span>
      </div>

      {/* Trigger — main description */}
      {issue.trigger && (
        <p className="text-xs font-medium text-foreground leading-snug">{issue.trigger}</p>
      )}

      {/* Escalate to */}
      {issue.escalate_to && (
        <div className="flex items-center gap-1.5 mt-2">
          <UserCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Escalate to:</span> {issue.escalate_to}
          </span>
        </div>
      )}

      {/* Resolve button — only for blocking, unresolved issues when callback provided */}
      {isBlocking && onResolve && (
        <button
          onClick={async () => {
            setResolving(true)
            try { await onResolve(issue.issue_id) } finally { setResolving(false) }
          }}
          disabled={resolving}
          className="mt-2.5 w-full flex items-center justify-center gap-1.5 rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <CheckCheck className="h-3.5 w-3.5" />
          {resolving ? "Resolving…" : `Resolve — ${issue.escalate_to ?? "Approver"}`}
        </button>
      )}
    </div>
  )
}

function NodeDetailPanel({
  nodeId,
  status,
  data,
  open,
  onClose,
  onResolveIssue,
}: {
  nodeId: NodeId
  status: PipelineNodeStatus
  data: RequestData
  open: boolean
  onClose: () => void
  onResolveIssue?: (issueId: string) => Promise<void>
}) {
  const label = nodeLabels[nodeId]
  const { icon } = statusConfig[status]

  const stageKey = nodeToStageId[nodeId]
  const stageData = stageKey ? (data.stages as Record<string, { issues: typeof data.stages.translation.issues; escalations: typeof data.stages.translation.escalations; reasonings: typeof data.stages.translation.reasonings; policy_violations: typeof data.stages.translation.policy_violations }>)[stageKey] : null

  const escalations = stageData?.escalations ?? []
  const issues = stageData?.issues ?? []
  const policyViolations = stageData?.policy_violations ?? []
  const reasonings = stageData?.reasonings ?? []

  const sortedEscalations = [...escalations].sort((a, b) => (b.blocking ? 1 : 0) - (a.blocking ? 1 : 0))
  const sortedIssues = [...issues].sort((a, b) => (b.blocking ? 1 : 0) - (a.blocking ? 1 : 0))

  const showApprovalTier = nodeId === "approval-tier"
  const showSuppliers = ["purely-eligible-suppliers", "restricted-suppliers", "geographical-rules", "evaluate-preferred-supplier", "apply-cat-rules-2", "pricing-calculation", "scoring-ranking", "final-check", "done"].includes(nodeId)
  const showRecommendation = nodeId === "final-check" || nodeId === "done"
  const showAuditTrail = nodeId === "done"

  const approvalTier = data.approval_tier
  const suppliers = data.supplier_shortlist ?? []
  const excluded = data.suppliers_excluded ?? []
  const recommendation = data.recommendation
  const auditTrail = data.audit_trail

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent side="right" className="w-105 sm:w-120 overflow-y-auto flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 py-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="shrink-0">{icon}</div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base leading-tight">{label}</SheetTitle>
              <p className="text-xs text-muted-foreground mt-0.5 capitalize">{status}</p>
            </div>
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-6 py-5">
          <div>
            <SectionHeader icon={<ShieldAlert className="h-4 w-4 text-destructive" />} title="Escalations" />
            {sortedEscalations.length === 0 ? <EmptyState label="No escalations" /> : (
              <div className="flex flex-col gap-2">
                {sortedEscalations.map((e) => (
                  <div key={e.escalation_id} className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-medium text-destructive">{e.rule}</span>
                      {e.blocking && <Badge variant="destructive" className="text-[10px] shrink-0">Blocking</Badge>}
                    </div>
                    {e.trigger && <p className="text-xs text-muted-foreground mt-1">{e.trigger}</p>}
                    {e.escalate_to && <p className="text-xs text-muted-foreground mt-0.5"><span className="font-medium">Escalate to:</span> {e.escalate_to}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <Separator />
          <div>
            <SectionHeader icon={<TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />} title="Issues" />
            {sortedIssues.length === 0 ? <EmptyState label="No issues" /> : (
              <div className="flex flex-col gap-2">
                {sortedIssues.map((issue) => (
                  <IssueCard key={issue.issue_id} issue={issue} onResolve={onResolveIssue} />
                ))}
              </div>
            )}
          </div>
          <Separator />
          <div>
            <SectionHeader icon={<Ban className="h-4 w-4 text-orange-600 dark:text-orange-400" />} title="Policy Violations" />
            {policyViolations.length === 0 ? <EmptyState label="No policy violations" /> : (
              <div className="flex flex-col gap-2">
                {policyViolations.map((pv, i) => (
                  <div key={i} className="rounded-md border border-orange-500/30 bg-orange-500/5 px-3 py-2.5">
                    <span className="text-xs font-medium text-orange-700 dark:text-orange-400">{pv.policy}</span>
                    {pv.description && <p className="text-xs text-muted-foreground mt-1">{pv.description}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <Separator />
          {showApprovalTier && approvalTier && (
            <>
              <div>
                <SectionHeader icon={<Info className="h-4 w-4 text-sky-600 dark:text-sky-400" />} title="Approval Tier" />
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs space-y-1.5">
                  <Row label="Tier" value={`Tier ${approvalTier.tier_number} (${approvalTier.threshold_id})`} />
                  <Row label="Budget" value={`${approvalTier.currency} ${approvalTier.budget_amount?.toLocaleString()}`} />
                  <Row label="Quotes Required" value={String(approvalTier.min_supplier_quotes)} />
                  {approvalTier.approvers?.length > 0 && <Row label="Approvers" value={approvalTier.approvers.join(", ")} />}
                  {approvalTier.deviation_approval_required_from?.length > 0 && <Row label="Deviation Approval" value={approvalTier.deviation_approval_required_from.join(", ")} />}
                  {approvalTier.is_boundary_case && <Row label="Boundary Case" value={approvalTier.boundary_value != null ? `Yes (boundary: ${approvalTier.boundary_value.toLocaleString()})` : "Yes"} />}
                </div>
              </div>
              <Separator />
            </>
          )}
          {showSuppliers && (
            <>
              <div>
                <SectionHeader icon={<Info className="h-4 w-4 text-sky-600 dark:text-sky-400" />} title={`Supplier Shortlist (${suppliers.length})`} />
                {suppliers.length === 0 ? <EmptyState label="No suppliers evaluated yet" /> : (
                  <div className="flex flex-col gap-2">
                    {suppliers.map((s) => (
                      <div key={s.supplier_id} className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">#{s.rank} {s.supplier_name}</span>
                          <div className="flex gap-1">
                            {s.preferred_supplier && <Badge variant="secondary" className="text-[10px]">Preferred</Badge>}
                            {s.is_incumbent && <Badge variant="outline" className="text-[10px]">Incumbent</Badge>}
                            {!s.policy_compliant && <Badge variant="destructive" className="text-[10px]">Non-compliant</Badge>}
                          </div>
                        </div>
                        <Row label="Total Price" value={`${s.currency ?? ""} ${s.total_price?.toLocaleString()}`} />
                        <Row label="Lead Time" value={`${s.standard_lead_time_days}d standard`} />
                        <Row label="Quality / Risk / ESG" value={`${s.quality_score} / ${s.risk_score} / ${s.esg_score}`} />
                        {s.recommendation_note && <p className="text-muted-foreground italic">{s.recommendation_note}</p>}
                      </div>
                    ))}
                  </div>
                )}
                {excluded.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Excluded ({excluded.length})</p>
                    <div className="flex flex-col gap-1.5">
                      {excluded.map((s) => (
                        <div key={s.supplier_id} className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs">
                          <span className="font-medium">{s.supplier_name}</span>
                          {s.reason && <p className="text-muted-foreground mt-0.5">{s.reason}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <Separator />
            </>
          )}
          {showRecommendation && recommendation?.status && (
            <>
              <div>
                <SectionHeader icon={<CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />} title="Recommendation" />
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs space-y-1.5">
                  <Row label="Status" value={recommendation.status} />
                  {recommendation.reason && <Row label="Reason" value={recommendation.reason} />}
                  {recommendation.preferred_supplier_if_resolved && <Row label="Preferred Supplier" value={recommendation.preferred_supplier_if_resolved} />}
                  {recommendation.preferred_supplier_rationale && <Row label="Rationale" value={recommendation.preferred_supplier_rationale} />}
                  {recommendation.minimum_budget_required > 0 && <Row label="Min. Budget" value={`${recommendation.minimum_budget_currency} ${recommendation.minimum_budget_required?.toLocaleString()}`} />}
                </div>
              </div>
              <Separator />
            </>
          )}
          {showAuditTrail && auditTrail?.policies_checked?.length > 0 && (
            <>
              <div>
                <SectionHeader icon={<FileText className="h-4 w-4 text-muted-foreground" />} title="Audit Trail" />
                <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5 text-xs space-y-1.5">
                  {auditTrail.policies_checked.length > 0 && <Row label="Policies Checked" value={auditTrail.policies_checked.join(", ")} />}
                  {auditTrail.pricing_tiers_applied && <Row label="Pricing Tiers" value={auditTrail.pricing_tiers_applied} />}
                  {auditTrail.data_sources_used?.length > 0 && <Row label="Data Sources" value={auditTrail.data_sources_used.join(", ")} />}
                  <Row label="Historical Awards" value={auditTrail.historical_awards_consulted ? "Yes" : "No"} />
                  {auditTrail.historical_award_note && <Row label="Note" value={auditTrail.historical_award_note} />}
                </div>
              </div>
              <Separator />
            </>
          )}
          {reasonings.length > 0 && (
            <>
              <div>
                <SectionHeader icon={<Info className="h-4 w-4 text-muted-foreground" />} title="Reasonings" />
                <div className="flex flex-col gap-2">
                  {reasonings.map((r, i) => (
                    <div key={r.step_id + i} className="rounded-md border border-border bg-muted/20 px-3 py-2.5 text-xs">
                      <span className="font-medium text-foreground">{r.aspect}</span>
                      <p className="text-muted-foreground mt-1">{r.reasoning}</p>
                    </div>
                  ))}
                </div>
              </div>
              <Separator />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ── Main graph view (exported) ────────────────────────────────────────────────

export function PipelineGraphView({
  nodeStatuses,
  requestData,
  isPipelineRunning,
  mode,
  onApprove,
  onResolveIssue,
}: {
  nodeStatuses: NodeStatuses
  requestData: RequestData
  isPipelineRunning: boolean
  mode?: OrchestratorMode
  onApprove?: () => Promise<void>
  onResolveIssue?: (stageKey: string, issueId: string) => Promise<void>
}) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId | null>(null)
  const lastNodeId = useRef<NodeId | null>(null)
  if (selectedNodeId) lastNodeId.current = selectedNodeId
  const [isApproving, setIsApproving] = useState(false)

  const workingStartTimes = useRef<Partial<Record<string, number>>>({})
  useEffect(() => {
    const now = Date.now()
    for (const [id, status] of Object.entries(nodeStatuses)) {
      if (status === "working" && workingStartTimes.current[id] === undefined) {
        workingStartTimes.current[id] = now
      } else if (status !== "working") {
        delete workingStartTimes.current[id]
      }
    }
  }, [nodeStatuses])

  const nodes = useMemo<Node[]>(() =>
    nodeDefinitions.map((def) => {
      if (def.type === "group-box") {
        const gb = groupBoxData[def.id] ?? { label: "", width: 0, height: 0 }
        return { ...def, data: { label: gb.label, width: gb.width, height: gb.height } }
      }
      const id     = def.id as NodeId
      const status = nodeStatuses[id] ?? "outstanding"
      return {
        ...def,
        data: {
          label: nodeLabels[id],
          status,
          startedAt: status === "working" ? (workingStartTimes.current[id] ?? Date.now()) : undefined,
        },
      }
    }),
    [nodeStatuses, workingStartTimes],
  )

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    if (node.type === "group-box") return
    setSelectedNodeId(node.id as NodeId)
  }, [])

  const onInit = useCallback((instance: ReactFlowInstance) => {
    instance.fitView({ nodes: [{ id: "request-submitted" }], padding: 3, maxZoom: 1, duration: 0 })
  }, [])

  // Derive blocked state: any stage has a blocking escalation or issue
  const isBlocked = !isPipelineRunning && Object.values(requestData.stages).some(
    (s) => s.escalations?.some((e) => e.blocking) || s.issues?.some((i) => i.blocking),
  )

  // First blocking escalation for the banner description
  const firstBlockingEscalation = Object.values(requestData.stages)
    .flatMap((s) => s.escalations ?? [])
    .find((e) => e.blocking)
  const firstBlockingIssue = Object.values(requestData.stages)
    .flatMap((s) => s.issues ?? [])
    .find((i) => i.blocking)
  const blockingTrigger = firstBlockingEscalation?.trigger ?? firstBlockingIssue?.trigger ?? "A blocking issue requires human approval before the pipeline can continue."
  const escalateTo = firstBlockingEscalation?.escalate_to ?? firstBlockingIssue?.escalate_to

  return (
    <div className="flex flex-col gap-4 h-full">
      {isPipelineRunning && mode === "owner" && (
        <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300 shrink-0">
          <Loader2 className="h-4 w-4 animate-spin" />
          Pipeline is running…
        </div>
      )}
      {mode === "observer" && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300 shrink-0">
          <Eye className="h-4 w-4" />
          Read-only — another tab is running this pipeline. Updates will appear in real-time.
        </div>
      )}
      {isBlocked && (
        <div className="flex items-start justify-between gap-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-destructive">Pipeline blocked — approval required</p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{blockingTrigger}</p>
              {escalateTo && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  <span className="font-medium">Escalate to:</span> {escalateTo}
                </p>
              )}
            </div>
          </div>
          {onApprove && (
            <button
              onClick={async () => {
                setIsApproving(true)
                try { await onApprove() } finally { setIsApproving(false) }
              }}
              disabled={isApproving}
              className="shrink-0 flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
              {isApproving ? "Approving…" : "Approve & Resume"}
            </button>
          )}
        </div>
      )}
      <div className="flex-1 rounded-lg border border-border bg-background min-h-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          onInit={onInit}
          colorMode={mounted && resolvedTheme === "dark" ? "dark" : "light"}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnScroll
          zoomOnScroll={false}
          zoomActivationKeyCode="Control"
        >
          <Background color="var(--border)" gap={24} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <NodeDetailPanel
        nodeId={lastNodeId.current ?? "request-submitted"}
        status={nodeStatuses[lastNodeId.current ?? "request-submitted"] ?? "outstanding"}
        data={requestData}
        open={!!selectedNodeId}
        onClose={() => setSelectedNodeId(null)}
        onResolveIssue={onResolveIssue
          ? (issueId) => {
              const stageKey = nodeToStageId[lastNodeId.current ?? "request-submitted"]
              return stageKey ? onResolveIssue(stageKey, issueId) : Promise.resolve()
            }
          : undefined
        }
      />
    </div>
  )
}
