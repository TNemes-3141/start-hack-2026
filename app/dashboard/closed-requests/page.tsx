"use client"

import { FolderCheck } from "lucide-react"
import { EmptyState } from "@/components/empty-state"

export default function ClosedRequestsPage() {
  return (
    <EmptyState
      icon={FolderCheck}
      title="No closed requests"
      description="You have no closed procurement requests yet. Submit your first request to begin."
    />
  )
}
