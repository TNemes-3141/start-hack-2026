import { RunsListPage } from "@/components/runs-list-page"

// All non-procurement roles see every request that has any escalation.
export default function EscalationsPage() {
  return <RunsListPage escalateTo={[]} />
}
