import { getSession } from "@/lib/session"
import { DashboardShell } from "@/components/dashboard-shell"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()

  return (
    <DashboardShell role={session.role} roleLabel={session.roleLabel}>
      {children}
    </DashboardShell>
  )
}
