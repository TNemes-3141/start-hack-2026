"use client"

import { useCallback, useMemo, useEffect, useRef, useState } from "react"
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
  ScrollText,
  FileText,
  ChevronRight,
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
  | "purely-eligible-suppliers" | "restricted-suppliers" | "check-eligible-supplier"
  | "apply-cat-rules-2" | "pricing-calculation" | "re-evaluate-tier"
  | "scoring-ranking" | "final-check" | "done"

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
      className={`rounded-md border-2 bg-white px-3 py-2 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${border}`}
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
  "restricted-suppliers":       "Restricted Suppliers",
  "check-eligible-supplier":    "Check Eligible Supplier",
  "apply-cat-rules-2":          "Apply Category Rules",
  "pricing-calculation":        "Pricing Calculation",
  "re-evaluate-tier":           "Re-evaluate Tier from Quote",
  "scoring-ranking":            "Scoring and Ranking",
  "final-check":                "Final Check",
  "done":                       "Done",
}

const nodeDefinitions: Omit<Node, "data">[] = [
  { id: "request-submitted",         type: "status", position: { x: 420, y: 0    } },
  { id: "translation",               type: "status", position: { x: 50,  y: 120  } },
  { id: "internal-coherence",        type: "status", position: { x: 310, y: 120  } },
  { id: "missing-required-data",     type: "status", position: { x: 570, y: 120  } },
  { id: "check-available-products",   type: "status", position: { x: 830, y: 120  } },
  { id: "inappropriate-requests",    type: "status", position: { x: 420, y: 260  } },
  { id: "apply-cat-rules-1",         type: "status", position: { x: 100, y: 380  } },
  { id: "approval-tier",             type: "status", position: { x: 400, y: 380  } },
  { id: "precedence-lookup",         type: "status", position: { x: 700, y: 380  } },
  { id: "purely-eligible-suppliers", type: "status", position: { x: 400, y: 500  } },
  { id: "restricted-suppliers",      type: "status", position: { x: 200, y: 620  } },
  { id: "check-eligible-supplier",   type: "status", position: { x: 600, y: 620  } },
  { id: "apply-cat-rules-2",         type: "status", position: { x: 400, y: 740  } },
  { id: "pricing-calculation",       type: "status", position: { x: 400, y: 860  } },
  { id: "re-evaluate-tier",          type: "status", position: { x: 400, y: 980  } },
  { id: "scoring-ranking",           type: "status", position: { x: 400, y: 1100 } },
  { id: "final-check",               type: "status", position: { x: 400, y: 1220 } },
  { id: "done",                      type: "status", position: { x: 400, y: 1340 } },
]

const edges: Edge[] = [
  { id: "e-rs-tr",    source: "request-submitted",         target: "translation" },
  { id: "e-rs-ic",    source: "request-submitted",         target: "internal-coherence" },
  { id: "e-rs-mrd",   source: "request-submitted",         target: "missing-required-data" },
  { id: "e-rs-cap",   source: "request-submitted",         target: "check-available-products" },
  { id: "e-tr-ir",    source: "translation",               target: "inappropriate-requests" },
  { id: "e-ic-ir",    source: "internal-coherence",        target: "inappropriate-requests" },
  { id: "e-mrd-ir",   source: "missing-required-data",     target: "inappropriate-requests" },
  { id: "e-cap-ir",   source: "check-available-products",   target: "inappropriate-requests" },
  { id: "e-ir-acr1",  source: "inappropriate-requests",    target: "apply-cat-rules-1" },
  { id: "e-ir-at",    source: "inappropriate-requests",    target: "approval-tier" },
  { id: "e-ir-pl",    source: "inappropriate-requests",    target: "precedence-lookup" },
  { id: "e-acr1-pes", source: "apply-cat-rules-1",         target: "purely-eligible-suppliers" },
  { id: "e-at-pes",   source: "approval-tier",             target: "purely-eligible-suppliers" },
  { id: "e-pl-pes",   source: "precedence-lookup",         target: "purely-eligible-suppliers" },
  { id: "e-pes-rs",   source: "purely-eligible-suppliers", target: "restricted-suppliers" },
  { id: "e-pes-ces",  source: "purely-eligible-suppliers", target: "check-eligible-supplier" },
  { id: "e-rs-acr2",  source: "restricted-suppliers",      target: "apply-cat-rules-2" },
  { id: "e-ces-acr2", source: "check-eligible-supplier",   target: "apply-cat-rules-2" },
  { id: "e-acr2-pc",  source: "apply-cat-rules-2",         target: "pricing-calculation" },
  { id: "e-pc-ret",   source: "pricing-calculation",       target: "re-evaluate-tier" },
  { id: "e-ret-sr",   source: "re-evaluate-tier",          target: "scoring-ranking" },
  { id: "e-sr-fc",    source: "scoring-ranking",           target: "final-check" },
  { id: "e-fc-done",  source: "final-check",               target: "done" },
]

// --- Node detail panel ---

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

  const escalations = data.escalations ?? []
  const issues = data.issues ?? []
  const validationIssues = data.validation?.issues_detected ?? []
  const policyViolations = data.policy_violations ?? []
  const reasonings = data.reasonings ?? []

  // Blocking escalations first, then non-blocking
  const sortedEscalations = [...escalations].sort((a, b) =>
    (b.blocking ? 1 : 0) - (a.blocking ? 1 : 0)
  )
  const sortedIssues = [...issues].sort((a, b) =>
    (b.blocking ? 1 : 0) - (a.blocking ? 1 : 0)
  )
  const criticalValidation = validationIssues.filter(i => i.severity === "critical" || i.severity === "high")
  const otherValidation = validationIssues.filter(i => i.severity !== "critical" && i.severity !== "high")

  // Node-specific extra sections
  const showApprovalTier = nodeId === "approval-tier"
  const showPreferredSupplier = nodeId === "precedence-lookup"
  const showCategoryRules = nodeId === "apply-cat-rules-1" || nodeId === "apply-cat-rules-2"
  const showSuppliers = ["purely-eligible-suppliers", "restricted-suppliers", "check-eligible-supplier", "pricing-calculation", "scoring-ranking"].includes(nodeId)
  const showRecommendation = nodeId === "final-check" || nodeId === "done"
  const showAuditTrail = nodeId === "done"

  const approvalThreshold = data.policy_evaluation?.approval_threshold
  const preferredSupplier = data.policy_evaluation?.preferred_supplier
  const categoryRules = data.policy_evaluation?.category_rules_applied ?? []
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
                      {issue.blocking && <Badge className="text-[10px] shrink-0 bg-amber-600 hover:bg-amber-600">Blocking</Badge>}
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

          {/* 3. VALIDATION ISSUES */}
          <div>
            <SectionHeader
              icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
              title="Validation"
            />
            {validationIssues.length === 0 ? (
              <EmptyState label="No validation issues" />
            ) : (
              <div className="flex flex-col gap-2">
                {[...criticalValidation, ...otherValidation].map((v) => {
                  const isHigh = v.severity === "critical" || v.severity === "high"
                  return (
                    <div
                      key={v.issue_id}
                      className={`rounded-md border px-3 py-2.5 ${isHigh
                        ? "border-destructive/30 bg-destructive/5"
                        : "border-border bg-muted/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className={`text-xs font-medium ${isHigh ? "text-destructive" : "text-foreground"}`}>
                          {v.type}
                        </span>
                        <Badge
                          variant={isHigh ? "destructive" : "secondary"}
                          className="text-[10px] shrink-0 capitalize"
                        >
                          {v.severity}
                        </Badge>
                      </div>
                      {v.description && <p className="text-xs text-muted-foreground mt-1">{v.description}</p>}
                      {v.action_required && (
                        <p className="text-xs mt-1">
                          <span className="font-medium">Action:</span>{" "}
                          <span className="text-muted-foreground">{v.action_required}</span>
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <Separator />

          {/* 4. POLICY VIOLATIONS */}
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

          {/* 5. NODE-SPECIFIC SECTIONS */}

          {showApprovalTier && approvalThreshold?.rule_applied && (
            <>
              <div>
                <SectionHeader icon={<Info className="h-4 w-4 text-sky-600 dark:text-sky-400" />} title="Approval Tier" />
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs space-y-1.5">
                  <Row label="Rule" value={approvalThreshold.rule_applied} />
                  <Row label="Basis" value={approvalThreshold.basis} />
                  <Row label="Quotes Required" value={String(approvalThreshold.quotes_required)} />
                  {approvalThreshold.approvers?.length > 0 && (
                    <Row label="Approvers" value={approvalThreshold.approvers.join(", ")} />
                  )}
                  {approvalThreshold.note && <Row label="Note" value={approvalThreshold.note} />}
                </div>
              </div>
              <Separator />
            </>
          )}

          {showPreferredSupplier && preferredSupplier?.supplier && (
            <>
              <div>
                <SectionHeader icon={<Info className="h-4 w-4 text-sky-600 dark:text-sky-400" />} title="Preferred Supplier" />
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs space-y-1.5">
                  <Row label="Supplier" value={preferredSupplier.supplier} />
                  <Row label="Status" value={preferredSupplier.status} />
                  <Row label="Is Preferred" value={preferredSupplier.is_preferred ? "Yes" : "No"} />
                  <Row label="Covers Delivery Country" value={preferredSupplier.covers_delivery_country ? "Yes" : "No"} />
                  {preferredSupplier.is_restricted && <Row label="Restricted" value="Yes" />}
                  {preferredSupplier.policy_note && <Row label="Note" value={preferredSupplier.policy_note} />}
                </div>
              </div>
              <Separator />
            </>
          )}

          {showCategoryRules && categoryRules.length > 0 && (
            <>
              <div>
                <SectionHeader icon={<Info className="h-4 w-4 text-sky-600 dark:text-sky-400" />} title="Category Rules Applied" />
                <ul className="space-y-1">
                  {categoryRules.map((r, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <ChevronRight className="h-3 w-3 mt-0.5 shrink-0" />
                      {r}
                    </li>
                  ))}
                </ul>
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

          {/* 6. REASONINGS */}
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

          {/* 7. LOGGING — placeholder */}
          <div>
            <SectionHeader
              icon={<ScrollText className="h-4 w-4 text-muted-foreground" />}
              title="Logs"
            />
            <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 text-center">
              <ScrollText className="h-5 w-5 text-muted-foreground/50 mx-auto mb-1.5" />
              <p className="text-xs text-muted-foreground">Logging not yet implemented</p>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">Step-level logs will appear here</p>
            </div>
          </div>

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

  // On init: zoom to fit the widest row (translation … check-available-product, x:50–1070)
  // while keeping request-submitted visible at the top.
  const onInit = useCallback((instance: ReactFlowInstance) => {
    instance.fitBounds(
      { x: 50, y: 0, width: 1020, height: 200 },
      { padding: 0.06 },
    )
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
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnScroll
          zoomOnScroll={false}
          zoomActivationKeyCode="Control"
        >
          <Background color="var(--border)" gap={24} />
          <Controls
            showInteractive={false}
            style={{
              backgroundColor: "var(--card)",
              border: "1px solid var(--border)",
              color: "var(--card-foreground)",
              borderRadius: "var(--radius)",
            }}
          />
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
