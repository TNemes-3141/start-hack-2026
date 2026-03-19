import { getSession } from "@/lib/session"
import { EscalationReportPage } from "@/components/escalation-report-page"
import { RunsListPage } from "@/components/runs-list-page"

// Role → escalation target keywords that appear in escalate_to fields
const ROLE_TARGETS: Record<string, string[]> = {
  "head-of-category":            ["head of category"],
  "head-of-strategic-sourcing":  ["head of strategic sourcing"],
  "cpo":                         ["cpo"],
}

export default async function EscalationsPage() {
  const session = await getSession()
  const role = session.role
  const roleLabel = session.roleLabel ?? "Unknown Role"

  const targets = role ? (ROLE_TARGETS[role] ?? []) : []

  // CPO, Head of Category, Head of Strategic Sourcing get the detailed report view.
  // Any other non-procurement role falls back to the standard list view.
  if (role && role in ROLE_TARGETS) {
    return (
      <div>
        <EscalationReportPage escalateTo={targets} roleLabel={roleLabel} />
      </div>
    )
  }

  // Fallback: standard escalation list (shows all blocking escalations)
  return (
    <div>
      <RunsListPage escalateTo={[]} />
    </div>
  )
}
