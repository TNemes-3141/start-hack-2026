import type { Role } from "@/lib/session"
import type { LucideIcon } from "lucide-react"
import { AlertTriangle, FolderOpen, FolderCheck } from "lucide-react"

export type NavItem = {
  label: string
  href: string
  icon: LucideIcon
  description: string
}

// Non-procurement roles all see any escalated request, regardless of escalation target.
export function roleSeesEscalations(role: Role | undefined): boolean {
  return !!role && role !== "procurement"
}

export function getNavItems(role: Role | undefined): NavItem[] {
  if (role === "procurement") {
    return [
      { label: "Open Requests",   href: "/dashboard/open-requests",   icon: FolderOpen,   description: "Track all active procurement requests currently in progress." },
      { label: "Closed Requests", href: "/dashboard/closed-requests", icon: FolderCheck,  description: "Browse completed and resolved procurement requests." },
    ]
  }
  // All approval-level roles see only escalated requests
  return [
    { label: "My Escalations", href: "/dashboard/escalations", icon: AlertTriangle, description: "Review requests that have been escalated and require your attention." },
  ]
}
