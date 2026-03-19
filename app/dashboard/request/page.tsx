"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
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
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import {
  Clock,
  Loader2,
  AlertTriangle,
  XCircle,
  CheckCircle2,
} from "lucide-react"

type Status = "outstanding" | "working" | "warning" | "escalation" | "done"

type NodeId =
  | "request-submitted" | "translation" | "internal-coherence"
  | "missing-required-data" | "check-available-product" | "inappropriate-requests"
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
  const hours   = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const display = hours > 0
    ? `${hours}h ${String(minutes).padStart(2, "0")}m`
    : `${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`

  return <span className="text-xs tabular-nums text-muted-foreground">{display}</span>
}

// --- Status node ---

const statusConfig: Record<Status, { icon: React.ReactNode; border: string }> = {
  outstanding: { icon: <Clock className="h-4 w-4 text-muted-foreground" />, border: "border-border" },
  working: { icon: <Loader2 className="h-4 w-4 animate-spin text-sky-600 dark:text-sky-400" />, border: "border-sky-600/60 dark:border-sky-400/60" },
  warning: { icon: <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />, border: "border-amber-600/60 dark:border-amber-400/60" },
  escalation: { icon: <XCircle className="h-4 w-4 text-destructive" />, border: "border-destructive/70" },
  done: { icon: <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />, border: "border-emerald-600/60 dark:border-emerald-400/60" },
}

function StatusNode({ data }: NodeProps) {
  const status   = (data.status   as Status)         ?? "outstanding"
  const idleSince = data.idleSince as number | undefined
  const { icon, border } = statusConfig[status]

  return (
    <div
      className={`rounded-md border-2 bg-card px-3 py-2 text-card-foreground shadow-sm ${border}`}
      style={{ minWidth: 180, width: "max-content" }}
    >
      <Handle type="target" position={Position.Top} className="bg-border! border-border!" />
      <div className="flex items-center justify-between gap-3">
        <span className="whitespace-nowrap text-sm font-medium">{data.label as string}</span>
        {icon}
      </div>
      {status === "working" && idleSince !== undefined && (
        <div className="mt-1">
          <ElapsedTimer startedAt={idleSince} />
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="bg-border! border-border!" />
    </div>
  )
}

const nodeTypes: NodeTypes = { status: StatusNode }

// --- Static data ---

const initialStatuses: Record<NodeId, Status> = {
  "request-submitted":         "done",
  "translation":               "done",
  "internal-coherence":        "done",
  "missing-required-data":     "warning",
  "check-available-product":   "working",
  "inappropriate-requests":    "outstanding",
  "apply-cat-rules-1":         "outstanding",
  "approval-tier":             "escalation",
  "precedence-lookup":         "outstanding",
  "purely-eligible-suppliers": "outstanding",
  "restricted-suppliers":      "warning",
  "check-eligible-supplier":   "outstanding",
  "apply-cat-rules-2":         "outstanding",
  "pricing-calculation":       "outstanding",
  "re-evaluate-tier":          "outstanding",
  "scoring-ranking":           "outstanding",
  "final-check":               "outstanding",
  "done":                      "outstanding",
}

// Offsets for working nodes — how long they've been in the working state
const idleOffsets: Partial<Record<NodeId, number>> = {
  "check-available-product": 4 * 60 * 1000,
}

const nodeLabels: Record<NodeId, string> = {
  "request-submitted":         "Request Submitted",
  "translation":               "Translation",
  "internal-coherence":        "Internal Coherence",
  "missing-required-data":     "Missing Required Data",
  "check-available-product":   "Check Available Product",
  "inappropriate-requests":    "Inappropriate Requests",
  "apply-cat-rules-1":         "Apply Category Rules",
  "approval-tier":             "Approval Tier",
  "precedence-lookup":         "Precedence Lookup",
  "purely-eligible-suppliers": "Purely Eligible Suppliers",
  "restricted-suppliers":      "Restricted Suppliers",
  "check-eligible-supplier":   "Check Eligible Supplier",
  "apply-cat-rules-2":         "Apply Category Rules",
  "pricing-calculation":       "Pricing Calculation",
  "re-evaluate-tier":          "Re-evaluate Tier from Quote",
  "scoring-ranking":           "Scoring and Ranking",
  "final-check":               "Final Check",
  "done":                      "Done",
}

const nodeDefinitions: Omit<Node, "data">[] = [
  { id: "request-submitted",        type: "status", position: { x: 300, y: 0    } },
  { id: "translation",              type: "status", position: { x: 50,  y: 120  } },
  { id: "internal-coherence",       type: "status", position: { x: 550, y: 120  } },
  { id: "missing-required-data",    type: "status", position: { x: 550, y: 240  } },
  { id: "check-available-product",  type: "status", position: { x: 550, y: 360  } },
  { id: "inappropriate-requests",   type: "status", position: { x: 300, y: 480  } },
  { id: "apply-cat-rules-1",        type: "status", position: { x: 0,   y: 600  } },
  { id: "approval-tier",            type: "status", position: { x: 300, y: 600  } },
  { id: "precedence-lookup",        type: "status", position: { x: 600, y: 600  } },
  { id: "purely-eligible-suppliers",type: "status", position: { x: 300, y: 720  } },
  { id: "restricted-suppliers",     type: "status", position: { x: 100, y: 840  } },
  { id: "check-eligible-supplier",  type: "status", position: { x: 500, y: 840  } },
  { id: "apply-cat-rules-2",        type: "status", position: { x: 300, y: 960  } },
  { id: "pricing-calculation",      type: "status", position: { x: 300, y: 1080 } },
  { id: "re-evaluate-tier",         type: "status", position: { x: 300, y: 1200 } },
  { id: "scoring-ranking",          type: "status", position: { x: 300, y: 1320 } },
  { id: "final-check",              type: "status", position: { x: 300, y: 1440 } },
  { id: "done",                     type: "status", position: { x: 300, y: 1560 } },
]

const edges: Edge[] = [
  { id: "e-rs-tr",    source: "request-submitted",         target: "translation" },
  { id: "e-rs-ic",    source: "request-submitted",         target: "internal-coherence" },
  { id: "e-ic-mrd",   source: "internal-coherence",        target: "missing-required-data" },
  { id: "e-mrd-cap",  source: "missing-required-data",     target: "check-available-product" },
  { id: "e-tr-ir",    source: "translation",               target: "inappropriate-requests" },
  { id: "e-cap-ir",   source: "check-available-product",   target: "inappropriate-requests" },
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

// --- Page ---

export default function RequestPage() {
  const [statuses, _setStatuses] = useState<Record<NodeId, Status>>(initialStatuses)

  const [idleSince] = useState<Partial<Record<NodeId, number>>>(() => {
    const now = Date.now()
    const result: Partial<Record<NodeId, number>> = {}
    for (const [id, offset] of Object.entries(idleOffsets)) {
      result[id as NodeId] = now - offset
    }
    return result
  })

  const nodes = useMemo<Node[]>(() =>
    nodeDefinitions.map((def) => {
      const id     = def.id as NodeId
      const status = statuses[id]
      return {
        ...def,
        data: {
          label:    nodeLabels[id],
          status,
          idleSince: status === "working" ? idleSince[id] : undefined,
        },
      }
    }),
    [statuses, idleSince]
  )

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    console.log("Node clicked:", node.id, "| status:", statuses[node.id as NodeId])
  }, [statuses])

  return (
    <div className="h-[calc(100vh-3.5rem-3rem)] rounded-lg border border-border bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        fitView
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
  )
}
