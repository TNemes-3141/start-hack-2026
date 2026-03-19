import Link from "next/link"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { getSession } from "@/lib/session"
import { getNavItems } from "@/lib/role-config"

const iconColors = [
  "from-indigo-500 to-violet-600 shadow-indigo-500/25",
  "from-cyan-500 to-blue-600 shadow-cyan-500/25",
  "from-emerald-500 to-teal-600 shadow-emerald-500/25",
  "from-rose-500 to-pink-600 shadow-rose-500/25",
]

export default async function DashboardPage() {
  const session = await getSession()
  const navItems = getNavItems(session.role)

  return (
    <div className="flex flex-col gap-8 animate-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight gradient-text">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Select a section to get started.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {navItems.map(({ href, icon: Icon, label, description }, i) => (
          <Link key={href} href={href} className="group">
            <Card className="h-full transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-0.5 cursor-pointer border-border hover:border-primary/30 bg-card">
              <CardHeader className="gap-4">
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${iconColors[i % iconColors.length]} shadow-lg text-white`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base text-foreground group-hover:text-primary transition-colors duration-200">{label}</CardTitle>
                  <CardDescription className="mt-1 text-sm leading-relaxed">{description}</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
