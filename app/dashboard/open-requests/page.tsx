"use client"

import { FolderOpen } from "lucide-react"
import { EmptyState } from "@/components/empty-state"

export default function OpenRequestsPage() {
  return (
    <EmptyState
      icon={FolderOpen}
      title="No open requests"
      description="You have no open procurement requests. Create one to kick off the approval workflow."
    />
  )
}
