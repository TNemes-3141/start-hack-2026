import Link from "next/link"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { getSession } from "@/lib/session"
import { getNavItems } from "@/lib/role-config"

export default async function DashboardPage() {
  const session = await getSession()
  const navItems = getNavItems(session.role)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Select a section to get started.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {navItems.map(({ href, icon: Icon, label, description }) => (
          <Link key={href} href={href}>
            <Card className="h-full transition-colors hover:bg-accent cursor-pointer">
              <CardHeader className="gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <CardTitle className="text-base">{label}</CardTitle>
                  <CardDescription className="mt-1 text-sm">{description}</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
