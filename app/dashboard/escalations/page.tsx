import { RunsListPage } from "@/components/runs-list-page"

// Shows all requests that have any blocking escalation, regardless of status.
export default function EscalationsPage() {
  return (
    <div>
      <RunsListPage escalateTo={[]} />
    </div>
  )
}
