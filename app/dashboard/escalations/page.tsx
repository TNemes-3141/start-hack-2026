import { getSession } from "@/lib/session"
import { EscalationReportPage } from "@/components/escalation-report-page"

// Role → escalation target keywords that appear in escalate_to fields
const ROLE_TARGETS: Record<string, string[]> = {
  "head-of-category":            ["head of category"],
  "head-of-strategic-sourcing":  ["head of strategic sourcing"],
  "cpo":                         ["cpo"],
}

// Senior-role keywords excluded from the procurement catch-all view
const SENIOR_TARGETS = Object.values(ROLE_TARGETS).flat()

export default async function EscalationsPage() {
  const session = await getSession()
  const role = session.role
  const roleLabel = session.roleLabel ?? "Unknown Role"

  // Senior roles (Head of Category, Head of Strategic Sourcing, CPO) see only their own escalations
  if (role && role in ROLE_TARGETS) {
    const targets = ROLE_TARGETS[role]
    return (
      <div>
        <EscalationReportPage escalateTo={targets} roleLabel={roleLabel} />
      </div>
    )
  }

  // Procurement (and any other role) sees everything NOT destined for a senior role
  return (
    <div>
      <EscalationReportPage escalateTo={[]} excludeTargets={SENIOR_TARGETS} roleLabel={roleLabel} />
    </div>
  )
}
