"use client"

import { AlertTriangle } from "lucide-react"
import { EmptyState } from "@/components/empty-state"

export default function EscalationsPage() {
  return (
    <EmptyState
      icon={AlertTriangle}
      title="No escalations"
      description="You have no active escalations. Submit a new procurement request to get started."
    />
  )
}
