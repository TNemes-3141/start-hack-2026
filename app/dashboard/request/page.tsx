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

function StatusNode({ data }: NodeProps) {
  const status    = (data.status    as PipelineNodeStatus) ?? "outstanding"
  const startedAt = data.startedAt  as number | undefined
  const { icon, border } = statusConfig[status]

  return (
    <div
      className={`rounded-md border-2 bg-card text-card-foreground px-3 py-2 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${border}`}
      style={{ width: 240 }}
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
      <Handle type="source" position={Position.Bottom} className="bg-border! border-border!" />
    </div>
  )
}

const nodeTypes: NodeTypes = { status: StatusNode }

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

const nodeDefinitions: Omit<Node, "data">[] = [
  // ── Entry ──────────────────────────────────────────────────────────────────
  { id: "request-submitted",         type: "status", position: { x: 200, y: 0    } },

  // ── Group 1 (parallel) ─────────────────────────────────────────────────────
  // Left branch: Translation (single node)
  { id: "translation",               type: "status", position: { x: 50,  y: 120  } },
  // Right branch: Internal Coherence → Missing Required Data → Check Available Products
  { id: "internal-coherence",        type: "status", position: { x: 360, y: 120  } },
  { id: "missing-required-data",     type: "status", position: { x: 360, y: 240  } },
  { id: "check-available-products",  type: "status", position: { x: 360, y: 360  } },

  // ── Sync / sequential ──────────────────────────────────────────────────────
  { id: "inappropriate-requests",    type: "status", position: { x: 200, y: 500  } },

  // ── Group 2 (parallel) ─────────────────────────────────────────────────────
  // Left branch: Apply Category Rules (single node)
  { id: "apply-cat-rules-1",         type: "status", position: { x: 50,  y: 640  } },
  // Right branch: Precedence Lookup → Approval Tier
  { id: "precedence-lookup",         type: "status", position: { x: 360, y: 640  } },
  { id: "approval-tier",             type: "status", position: { x: 360, y: 760  } },

  // ── Rest (sequential) ──────────────────────────────────────────────────────
  { id: "purely-eligible-suppliers",   type: "status", position: { x: 200, y: 900  } },
  // Branch A: restricted → geographical (sequential)
  { id: "restricted-suppliers",        type: "status", position: { x: 50,  y: 1020 } },
  { id: "geographical-rules",          type: "status", position: { x: 50,  y: 1140 } },
  // Branch B: evaluate preferred supplier
  { id: "evaluate-preferred-supplier", type: "status", position: { x: 360, y: 1020 } },
  // Fan-in
  { id: "apply-cat-rules-2",           type: "status", position: { x: 200, y: 1280 } },
  { id: "pricing-calculation",         type: "status", position: { x: 200, y: 1400 } },
  { id: "re-evaluate-tier",            type: "status", position: { x: 200, y: 1520 } },
  { id: "scoring-ranking",             type: "status", position: { x: 200, y: 1640 } },
  { id: "final-check",                 type: "status", position: { x: 200, y: 1760 } },
  { id: "done",                        type: "status", position: { x: 200, y: 1880 } },
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
  "final-check":               "scoring_and_ranking",
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
  const showSuppliers = ["purely-eligible-suppliers", "restricted-suppliers", "geographical-rules", "evaluate-preferred-supplier", "apply-cat-rules-2", "pricing-calculation", "scoring-ranking"].includes(nodeId)
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
                            {s.preferred && <Badge variant="secondary" className="text-[10px]">Preferred</Badge>}
                            {s.incumbent && <Badge variant="outline" className="text-[10px]">Incumbent</Badge>}
                            {!s.policy_compliant && <Badge variant="destructive" className="text-[10px]">Non-compliant</Badge>}
                          </div>
                        </div>
                        <Row label="Total Price" value={`€${s.total_price_eur?.toLocaleString()}`} />
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
                  {reasonings.map((r) => (
                    <div key={r.step_id} className="rounded-md border border-border bg-muted/20 px-3 py-2.5 text-xs">
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
  const { nodeStatuses, requestData, isPipelineRunning } = useRequestStore()
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId | null>(null)
  // Keep the last non-null nodeId so the panel content doesn't blank mid-close-animation
  const lastNodeId = useRef<NodeId | null>(null)
  if (selectedNodeId) lastNodeId.current = selectedNodeId

  // Track when each node first entered "working" state for the elapsed timer
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
      const id     = def.id as NodeId
      const status = nodeStatuses[id] ?? "outstanding"
      return {
        ...def,
        data: {
          label:    nodeLabels[id],
          status,
          startedAt: status === "working" ? (workingStartTimes.current[id] ?? Date.now()) : undefined,
        },
      }
    }),
    [nodeStatuses, workingStartTimes]
  )

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    setSelectedNodeId(node.id as NodeId)
  }, [])

  const onInit = useCallback((instance: ReactFlowInstance) => {
    instance.fitView({ nodes: [{ id: "request-submitted" }], padding: 3, maxZoom: 1, duration: 0 })
  }, [])

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-3.5rem-3rem)]">
      {isPipelineRunning && (
        <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Pipeline is running…
        </div>
      )}
      <div className="flex-1 rounded-lg border border-border bg-background">
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
      />
    </div>
  )
}
