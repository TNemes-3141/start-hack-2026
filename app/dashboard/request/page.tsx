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
  ThumbsUp,
  Trophy,
} from "lucide-react"
import { useRequestStore, type PipelineNodeStatus } from "@/lib/request-store"
import type { RequestData } from "@/lib/request-data"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

type NodeId =
  | "request-submitted" | "translation" | "internal-coherence"
  | "missing-required-data" | "check-available-products" | "inappropriate-requests"
  | "apply-cat-rules-1" | "approval-tier" | "precedence-lookup"
  | "purely-eligible-suppliers" | "restricted-suppliers" | "geographical-rules"
  | "evaluate-preferred-supplier" | "apply-cat-rules-2" | "pricing-calculation"
  | "re-evaluate-tier" | "scoring-ranking" | "final-check" | "done"

// --- Elapsed timer component ---

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

// --- Status node ---

const statusConfig: Record<PipelineNodeStatus, { icon: React.ReactNode; border: string }> = {
  outstanding: { icon: <Clock className="h-4 w-4 text-muted-foreground" />, border: "border-border" },
  working:     { icon: <Loader2 className="h-4 w-4 animate-spin text-sky-600 dark:text-sky-400" />, border: "border-sky-600/60 dark:border-sky-400/60" },
  warning:     { icon: <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />, border: "border-amber-600/60 dark:border-amber-400/60" },
  escalation:  { icon: <XCircle className="h-4 w-4 text-destructive" />, border: "border-destructive/70" },
  done:        { icon: <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />, border: "border-emerald-600/60 dark:border-emerald-400/60" },
}

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`
}

function StatusNode({ data }: NodeProps) {
  const status            = (data.status            as PipelineNodeStatus) ?? "outstanding"
  const startedAt         = data.startedAt          as number | undefined
  const completedDuration = data.completedDuration  as number | undefined
  const { icon, border } = statusConfig[status]

  const isTerminal = status === "done" || status === "escalation" || status === "warning"

  return (
    <div
      className={`rounded-md border-2 bg-card text-card-foreground px-3 py-2 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${border}`}
      style={{ width: 260 }}
    >
      <Handle type="target" position={Position.Top} className="bg-border! border-border!" />
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{data.label as string}</span>
        {icon}
      </div>
      {status === "working" && startedAt !== undefined && (
        <div className="mt-1">
          <ElapsedTimer startedAt={startedAt} />
        </div>
      )}
      {isTerminal && completedDuration !== undefined && (
        <div className="mt-1">
          <span className="text-xs tabular-nums text-muted-foreground">{formatDuration(completedDuration)}</span>
        </div>
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

// --- Static layout ---

const nodeLabels: Record<NodeId, string> = {
  "request-submitted":          "Request Submitted",
  "translation":                "Translation",
  "internal-coherence":         "Internal Coherence",
  "missing-required-data":      "Missing Required Data",
  "check-available-products":    "Check Available Products",
  "inappropriate-requests":     "Inappropriate Requests",
  "apply-cat-rules-1":          "Apply Category Rules",
  "approval-tier":              "Approval Tier",
  "precedence-lookup":          "Precedence Lookup",
  "purely-eligible-suppliers":  "Purely Eligible Suppliers",
  "restricted-suppliers":        "Restricted Suppliers",
  "geographical-rules":          "Geographical Rules",
  "evaluate-preferred-supplier": "Evaluate Preferred Supplier",
  "apply-cat-rules-2":           "Apply Dynamic Category Rules",
  "pricing-calculation":        "Pricing Calculation",
  "re-evaluate-tier":           "Re-evaluate Tier from Quote",
  "scoring-ranking":            "Scoring and Ranking",
  "final-check":                "Final Check",
  "done":                       "Done",
}

// ── Layout constants ───────────────────────────────────────────────────────
const NODE_W   = 280   // StatusNode width (matches style={{ width: 280 }})
const NODE_H   = 44    // Approximate rendered height of a StatusNode
const BOX_PAD  = 16    // Padding on every side between box border and node edges

const gbProps = { type: "group-box", selectable: false, draggable: false, focusable: false } as const

// ── Status-node positions (single source of truth) ─────────────────────────
const snPos: Record<string, { x: number; y: number }> = {
  "request-submitted":          { x: 200, y: 0    },
  "translation":                { x: 50,  y: 140  },
  "internal-coherence":         { x: 360, y: 140  },
  "missing-required-data":      { x: 360, y: 260  },
  "check-available-products":   { x: 360, y: 380  },
  "inappropriate-requests":     { x: 200, y: 520  },
  "apply-cat-rules-1":          { x: 50,  y: 660  },
  "precedence-lookup":          { x: 360, y: 660  },
  "approval-tier":              { x: 360, y: 780  },
  "purely-eligible-suppliers":  { x: 200, y: 920  },
  "restricted-suppliers":       { x: 50,  y: 1060 },
  "geographical-rules":         { x: 50,  y: 1180 },
  "evaluate-preferred-supplier":{ x: 360, y: 1060 },
  "apply-cat-rules-2":          { x: 200, y: 1320 },
  "pricing-calculation":        { x: 200, y: 1460 },
  "re-evaluate-tier":           { x: 200, y: 1580 },
  "scoring-ranking":            { x: 200, y: 1720 },
  "final-check":                { x: 200, y: 1860 },
  "done":                       { x: 200, y: 2000 },
}

// ── Group definitions ───────────────────────────────────────────────────────
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

// ── Computed group-box layout ───────────────────────────────────────────────
const groupBoxLayout = Object.fromEntries(
  groupDefs.map(g => [g.id, computeGroupBox(g.members)])
)

const groupBoxData: Record<string, { label: string; width: number; height: number }> = Object.fromEntries(
  groupDefs.map(g => [g.id, { label: g.label, ...groupBoxLayout[g.id] }])
)

// ── nodeDefinitions (group boxes first within each group = render behind) ──
const nodeDefinitions: Omit<Node, "data">[] = [
  { id: "request-submitted", type: "status", position: snPos["request-submitted"] },
  ...groupDefs.flatMap(g => [
    { id: g.id, ...gbProps, position: { x: groupBoxLayout[g.id].x, y: groupBoxLayout[g.id].y } },
    ...g.members.map(id => ({ id, type: "status", position: snPos[id] })),
  ]),
  { id: "done", type: "status", position: snPos["done"] },
]

const edges: Edge[] = [
  // request-submitted fans out to both parallel branches
  { id: "e-rs-tr",    source: "request-submitted",         target: "translation" },
  { id: "e-rs-ic",    source: "request-submitted",         target: "internal-coherence" },

  // Right branch of Group 1 (sequential)
  { id: "e-ic-mrd",   source: "internal-coherence",        target: "missing-required-data" },
  { id: "e-mrd-cap",  source: "missing-required-data",     target: "check-available-products" },

  // Both branches fan in to Inappropriate Requests
  { id: "e-tr-ir",    source: "translation",               target: "inappropriate-requests" },
  { id: "e-cap-ir",   source: "check-available-products",  target: "inappropriate-requests" },

  // Inappropriate Requests fans out to both parallel branches of Group 2
  { id: "e-ir-acr1",  source: "inappropriate-requests",    target: "apply-cat-rules-1" },
  { id: "e-ir-pl",    source: "inappropriate-requests",    target: "precedence-lookup" },

  // Right branch of Group 2 (sequential)
  { id: "e-pl-at",    source: "precedence-lookup",         target: "approval-tier" },

  // Both branches fan in to Purely Eligible Suppliers
  { id: "e-acr1-pes", source: "apply-cat-rules-1",         target: "purely-eligible-suppliers" },
  { id: "e-at-pes",   source: "approval-tier",             target: "purely-eligible-suppliers" },

  // Group 3: two parallel branches fan out from purely-eligible-suppliers
  { id: "e-pes-rs",   source: "purely-eligible-suppliers",   target: "restricted-suppliers" },
  { id: "e-pes-eps",  source: "purely-eligible-suppliers",   target: "evaluate-preferred-supplier" },
  // Branch A: restricted → geographical
  { id: "e-rs-gr",    source: "restricted-suppliers",        target: "geographical-rules" },
  // Fan-in to apply-cat-rules-2
  { id: "e-gr-acr2",  source: "geographical-rules",          target: "apply-cat-rules-2" },
  { id: "e-eps-acr2", source: "evaluate-preferred-supplier", target: "apply-cat-rules-2" },
  { id: "e-acr2-pc",  source: "apply-cat-rules-2",         target: "pricing-calculation" },
  { id: "e-pc-ret",   source: "pricing-calculation",       target: "re-evaluate-tier" },
  { id: "e-ret-sr",   source: "re-evaluate-tier",          target: "scoring-ranking" },
  { id: "e-sr-fc",    source: "scoring-ranking",           target: "final-check" },
  { id: "e-fc-done",  source: "final-check",               target: "done" },
]

// --- Node detail panel ---

// Map UI node IDs to pipeline stage IDs
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

function NodeDetailPanel({
  nodeId,
  status,
  data,
  open,
  onClose,
}: {
  nodeId: NodeId
  status: PipelineNodeStatus
  data: RequestData
  open: boolean
  onClose: () => void
}) {
  const label = nodeLabels[nodeId]
  const { icon } = statusConfig[status]

  // Pull stage-specific data
  const stageKey = nodeToStageId[nodeId]
  const stageData = stageKey ? (data.stages as Record<string, { issues: typeof data.stages.translation.issues; escalations: typeof data.stages.translation.escalations; reasonings: typeof data.stages.translation.reasonings; policy_violations: typeof data.stages.translation.policy_violations }>)[stageKey] : null

  const escalations = stageData?.escalations ?? []
  const issues = stageData?.issues ?? []
  const policyViolations = stageData?.policy_violations ?? []
  const reasonings = stageData?.reasonings ?? []

  // Blocking first
  const sortedEscalations = [...escalations].sort((a, b) => (b.blocking ? 1 : 0) - (a.blocking ? 1 : 0))
  const sortedIssues = [...issues].sort((a, b) => (b.blocking ? 1 : 0) - (a.blocking ? 1 : 0))

  // Node-specific extra sections
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
        {/* Header */}
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

          {/* 1. ESCALATIONS — highest priority */}
          <div>
            <SectionHeader
              icon={<ShieldAlert className="h-4 w-4 text-destructive" />}
              title="Escalations"
            />
            {sortedEscalations.length === 0 ? (
              <EmptyState label="No escalations" />
            ) : (
              <div className="flex flex-col gap-2">
                {sortedEscalations.map((e) => (
                  <div key={e.escalation_id} className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-medium text-destructive">{e.rule}</span>
                      {e.blocking && <Badge variant="destructive" className="text-[10px] shrink-0">Blocking</Badge>}
                    </div>
                    {e.trigger && <p className="text-xs text-muted-foreground mt-1">{e.trigger}</p>}
                    {e.escalate_to && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <span className="font-medium">Escalate to:</span> {e.escalate_to}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* 2. ISSUES */}
          <div>
            <SectionHeader
              icon={<TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
              title="Issues"
            />
            {sortedIssues.length === 0 ? (
              <EmptyState label="No issues" />
            ) : (
              <div className="flex flex-col gap-2">
                {sortedIssues.map((issue) => (
                  <div key={issue.issue_id} className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-400">{issue.issue_id}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <Badge variant="secondary" className={`text-[10px] capitalize ${
                          issue.severity === "critical" ? "bg-destructive text-destructive-foreground" :
                          issue.severity === "high" ? "bg-orange-500 text-white" :
                          issue.severity === "middle" ? "bg-amber-500 text-white" : ""
                        }`}>{issue.severity}</Badge>
                        {issue.blocking && <Badge className="text-[10px] bg-amber-600 hover:bg-amber-600">Blocking</Badge>}
                      </div>
                    </div>
                    {issue.trigger && <p className="text-xs text-muted-foreground mt-1">{issue.trigger}</p>}
                    {issue.escalate_to && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <span className="font-medium">Escalate to:</span> {issue.escalate_to}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* 3. POLICY VIOLATIONS */}
          <div>
            <SectionHeader
              icon={<Ban className="h-4 w-4 text-orange-600 dark:text-orange-400" />}
              title="Policy Violations"
            />
            {policyViolations.length === 0 ? (
              <EmptyState label="No policy violations" />
            ) : (
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

          {/* 4. NODE-SPECIFIC SECTIONS */}

          {showApprovalTier && approvalTier && (
            <>
              <div>
                <SectionHeader icon={<Info className="h-4 w-4 text-sky-600 dark:text-sky-400" />} title="Approval Tier" />
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs space-y-1.5">
                  <Row label="Tier" value={`Tier ${approvalTier.tier_number} (${approvalTier.threshold_id})`} />
                  <Row label="Budget" value={`${approvalTier.currency} ${approvalTier.budget_amount?.toLocaleString()}`} />
                  <Row label="Quotes Required" value={String(approvalTier.min_supplier_quotes)} />
                  {approvalTier.approvers?.length > 0 && (
                    <Row label="Approvers" value={approvalTier.approvers.join(", ")} />
                  )}
                  {approvalTier.deviation_approval_required_from?.length > 0 && (
                    <Row label="Deviation Approval" value={approvalTier.deviation_approval_required_from.join(", ")} />
                  )}
                  {approvalTier.is_boundary_case && (
                    <Row label="Boundary Case" value={approvalTier.boundary_value != null ? `Yes (boundary: ${approvalTier.boundary_value.toLocaleString()})` : "Yes"} />
                  )}
                </div>
              </div>
              <Separator />
            </>
          )}

          {showSuppliers && (
            <>
              <div>
                <SectionHeader icon={<Info className="h-4 w-4 text-sky-600 dark:text-sky-400" />} title={`Supplier Shortlist (${suppliers.length})`} />
                {suppliers.length === 0 ? (
                  <EmptyState label="No suppliers evaluated yet" />
                ) : (
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
                  {recommendation.preferred_supplier_if_resolved && (
                    <Row label="Preferred Supplier" value={recommendation.preferred_supplier_if_resolved} />
                  )}
                  {recommendation.preferred_supplier_rationale && (
                    <Row label="Rationale" value={recommendation.preferred_supplier_rationale} />
                  )}
                  {recommendation.minimum_budget_required > 0 && (
                    <Row label="Min. Budget" value={`${recommendation.minimum_budget_currency} ${recommendation.minimum_budget_required?.toLocaleString()}`} />
                  )}
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
                  {auditTrail.policies_checked.length > 0 && (
                    <Row label="Policies Checked" value={auditTrail.policies_checked.join(", ")} />
                  )}
                  {auditTrail.pricing_tiers_applied && (
                    <Row label="Pricing Tiers" value={auditTrail.pricing_tiers_applied} />
                  )}
                  {auditTrail.data_sources_used?.length > 0 && (
                    <Row label="Data Sources" value={auditTrail.data_sources_used.join(", ")} />
                  )}
                  <Row label="Historical Awards" value={auditTrail.historical_awards_consulted ? "Yes" : "No"} />
                  {auditTrail.historical_award_note && (
                    <Row label="Note" value={auditTrail.historical_award_note} />
                  )}
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* 5. REASONINGS */}
          {reasonings.length > 0 && (
            <>
              <div>
                <SectionHeader icon={<Info className="h-4 w-4 text-muted-foreground" />} title="Reasonings" />
                <div className="flex flex-col gap-2">
                  {reasonings.map((r, i) => (
                    <div key={`${r.step_id}-${i}`} className="rounded-md border border-border bg-muted/20 px-3 py-2.5 text-xs">
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <span className="font-medium text-foreground shrink-0">{label}:</span>
      <span className="text-muted-foreground wrap-break-word">{value}</span>
    </div>
  )
}

// --- Page ---

export default function RequestPage() {
  const { nodeStatuses, requestData, isPipelineRunning, runId, approveAndResume } = useRequestStore()
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId | null>(null)
  const [isApproving, setIsApproving] = useState(false)
  // Keep the last non-null nodeId so the panel content doesn't blank mid-close-animation
  const lastNodeId = useRef<NodeId | null>(null)
  if (selectedNodeId) lastNodeId.current = selectedNodeId

  // Track when each node first entered "working" state for the elapsed timer
  const workingStartTimes = useRef<Partial<Record<string, number>>>({})
  const [completedDurations, setCompletedDurations] = useState<Partial<Record<string, number>>>({})
  useEffect(() => {
    const now = Date.now()
    const newDurations: Partial<Record<string, number>> = {}
    let changed = false
    for (const [id, status] of Object.entries(nodeStatuses)) {
      if (status === "working" && workingStartTimes.current[id] === undefined) {
        workingStartTimes.current[id] = now
      } else if (status !== "working" && workingStartTimes.current[id] !== undefined) {
        newDurations[id] = now - workingStartTimes.current[id]!
        delete workingStartTimes.current[id]
        changed = true
      }
    }
    if (changed) setCompletedDurations(prev => ({ ...prev, ...newDurations }))
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
          label:    nodeLabels[id],
          status,
          startedAt: status === "working" ? (workingStartTimes.current[id] ?? Date.now()) : undefined,
          completedDuration: status !== "working" && status !== "outstanding" ? completedDurations[id] : undefined,
        },
      }
    }),
    [nodeStatuses, completedDurations]
  )

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    setSelectedNodeId(node.id as NodeId)
  }, [])

  const onInit = useCallback((instance: ReactFlowInstance) => {
    instance.fitView({ nodes: [{ id: "request-submitted" }], padding: 3, maxZoom: 1, duration: 0 })
  }, [])

  const isBlocked = !isPipelineRunning && Object.values(requestData.stages).some(
    (s) => s.escalations?.some((e) => e.blocking) || s.issues?.some((i) => i.blocking),
  )
  const isPipelineDone = nodeStatuses["done"] === "done"

  const firstBlockingEscalation = Object.values(requestData.stages)
    .flatMap((s) => s.escalations ?? [])
    .find((e) => e.blocking)
  const firstBlockingIssue = Object.values(requestData.stages)
    .flatMap((s) => s.issues ?? [])
    .find((i) => i.blocking)
  const blockingTrigger = firstBlockingEscalation?.trigger ?? firstBlockingIssue?.trigger ?? "A blocking issue requires human approval before the pipeline can continue."
  const escalateTo = firstBlockingEscalation?.escalate_to ?? firstBlockingIssue?.escalate_to

  async function handleApprove() {
    if (!runId) return
    setIsApproving(true)
    try { await approveAndResume(runId, requestData, "Procurement Manager") }
    finally { setIsApproving(false) }
  }

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-3.5rem-3rem)] overflow-y-auto">
      {isPipelineRunning && (
        <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300 shrink-0">
          <Loader2 className="h-4 w-4 animate-spin" />
          Pipeline is running…
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
          <button
            onClick={handleApprove}
            disabled={isApproving}
            className="shrink-0 flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            {isApproving ? "Approving…" : "Approve & Resume"}
          </button>
        </div>
      )}
      <div className="rounded-lg border border-border bg-background" style={{ height: "calc(100vh - 3.5rem - 3rem - 2rem)" }}>
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

      {isPipelineDone && requestData.supplier_shortlist.length > 0 && (
        <ShortlistResults
          shortlist={requestData.supplier_shortlist}
          recommendation={requestData.recommendation}
          excluded={requestData.suppliers_excluded}
          currency={requestData.request_interpretation.currency ?? ""}
        />
      )}

      <NodeDetailPanel
        nodeId={lastNodeId.current ?? "request-submitted"}
        status={nodeStatuses[lastNodeId.current ?? "request-submitted"] ?? "outstanding"}
        data={requestData}
        open={!!selectedNodeId}
        onClose={() => setSelectedNodeId(null)}
      />
    </div>
  )
}

// ── Shortlist Results ─────────────────────────────────────────────────────────

type ShortlistResultsProps = {
  shortlist: import("@/lib/request-data").ShortlistEntry[]
  recommendation: import("@/lib/request-data").RequestData["recommendation"]
  excluded: { supplier_id: string; supplier_name: string; reason: string }[]
  currency: string
}

function ShortlistResults({ shortlist, recommendation, excluded, currency }: ShortlistResultsProps) {
  const winner = shortlist[0]
  const statusColor =
    recommendation.status === "recommend_award"
      ? "border-emerald-500/40 bg-emerald-500/5"
      : recommendation.status === "escalated"
      ? "border-destructive/40 bg-destructive/5"
      : "border-amber-500/40 bg-amber-500/5"

  return (
    <div className="flex flex-col gap-4 shrink-0">
      {/* Header */}
      <div className={`rounded-lg border px-4 py-3 ${statusColor}`}>
        <div className="flex items-start gap-3">
          <Trophy className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              {recommendation.status === "recommend_award"
                ? `Recommended: ${recommendation.preferred_supplier_if_resolved}`
                : recommendation.status === "escalated"
                ? "Escalated — manual review required"
                : "No compliant supplier found"}
            </p>
            {recommendation.reason && (
              <p className="text-xs text-muted-foreground mt-0.5">{recommendation.reason}</p>
            )}
            {recommendation.preferred_supplier_rationale && (
              <p className="text-xs text-muted-foreground mt-0.5 italic">{recommendation.preferred_supplier_rationale}</p>
            )}
          </div>
        </div>
      </div>

      {/* Ranked supplier table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Supplier Shortlist — {shortlist.length} Evaluated</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground w-8">Rank</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Supplier</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Total Price</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Unit Price</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Lead Time</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Quality</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Risk</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">ESG</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Score</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Flags</th>
              </tr>
            </thead>
            <tbody>
              {shortlist.map((s) => {
                const isWinner = s.rank === 1
                return (
                  <tr
                    key={s.supplier_id}
                    className={`border-b border-border last:border-0 ${isWinner ? "bg-emerald-500/5" : "hover:bg-muted/20"}`}
                  >
                    <td className="px-3 py-2.5 text-center">
                      {isWinner
                        ? <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-bold">1</span>
                        : <span className="text-muted-foreground">#{s.rank}</span>
                      }
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`font-medium ${isWinner ? "text-emerald-700 dark:text-emerald-400" : "text-foreground"}`}>
                        {s.supplier_name}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                      {currency} {s.total_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {s.unit_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {s.scoring_breakdown.lead_time_status === "expedited_only"
                        ? <span className="text-amber-600">{s.expedited_lead_time_days}d exp</span>
                        : s.scoring_breakdown.lead_time_status === "cannot_meet"
                        ? <span className="text-destructive">{s.standard_lead_time_days}d ⚠</span>
                        : `${s.standard_lead_time_days}d`}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{s.quality_score ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{s.risk_score ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{s.esg_score ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                      {s.ranking_score.toFixed(1)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {s.preferred_supplier && (
                          <span className="inline-flex items-center rounded px-1 py-0.5 text-[10px] bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">Preferred</span>
                        )}
                        {s.is_requester_preferred && (
                          <span className="inline-flex items-center rounded px-1 py-0.5 text-[10px] bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">Requested</span>
                        )}
                        {s.is_incumbent && (
                          <span className="inline-flex items-center rounded px-1 py-0.5 text-[10px] bg-muted text-muted-foreground">Incumbent</span>
                        )}
                        {!s.policy_compliant && (
                          <span className="inline-flex items-center rounded px-1 py-0.5 text-[10px] bg-destructive/10 text-destructive">Non-compliant</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Excluded suppliers */}
      {excluded.length > 0 && (
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Excluded Suppliers ({excluded.length})</p>
          <div className="flex flex-col gap-1.5">
            {excluded.map((s) => (
              <div key={s.supplier_id} className="flex items-start gap-2 text-xs">
                <span className="font-medium text-foreground shrink-0">{s.supplier_name}</span>
                <span className="text-muted-foreground">— {s.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scoring weights note */}
      {winner?.scoring_breakdown && (
        <p className="text-xs text-muted-foreground px-1">
          Scoring weights — Price: {(winner.scoring_breakdown.weights.price).toFixed(0)}%,
          Quality: {(winner.scoring_breakdown.weights.quality).toFixed(0)}%,
          Risk: {(winner.scoring_breakdown.weights.risk).toFixed(0)}%,
          ESG: {(winner.scoring_breakdown.weights.esg).toFixed(0)}%.
          Bonuses: policy-preferred +5, incumbent +2, data-residency +3.
          Penalties: expedited-only −3, cannot-meet −8.
        </p>
      )}
    </div>
  )
}
