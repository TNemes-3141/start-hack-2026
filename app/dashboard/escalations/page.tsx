import { RunsListPage } from "@/components/runs-list-page";
import { RequestData } from "@/lib/request-data";

function EscalationInformationCard({
  requestData,
}: {
  requestData: RequestData;
}) {
  return 
}

// All non-procurement roles see every request that has any escalation.
export default function EscalationsPage() {
  return (
    <div>
      <RunsListPage escalateTo={[]} />
    </div>
  );
}
