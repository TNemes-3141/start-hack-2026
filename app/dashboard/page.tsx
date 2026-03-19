import Link from "next/link"
import { AlertTriangle, FolderOpen, FolderCheck } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

const sections = [
  {
    href: "/dashboard/escalations",
    icon: AlertTriangle,
    title: "Escalations",
    description: "Review requests that require immediate attention or approval.",
  },
  {
    href: "/dashboard/open-requests",
    icon: FolderOpen,
    title: "Open Requests",
    description: "Track all active procurement requests currently in progress.",
  },
  {
    href: "/dashboard/closed-requests",
    icon: FolderCheck,
    title: "Closed Requests",
    description: "Browse completed and resolved procurement requests.",
  },
]

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Select a section to get started.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {sections.map(({ href, icon: Icon, title, description }) => (
          <Link key={href} href={href}>
            <Card className="h-full transition-colors hover:bg-accent cursor-pointer">
              <CardHeader className="gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <CardTitle className="text-base">{title}</CardTitle>
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
