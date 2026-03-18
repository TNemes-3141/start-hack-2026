import { User, ShoppingCart, Tag, TrendingUp, Briefcase } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { selectRole } from "@/app/actions"
import type { Role } from "@/lib/session"

const roles: { role: Role; label: string; description: string; icon: React.ReactNode }[] = [
  {
    role: "client",
    label: "Client",
    description: "Submit and track your procurement requests.",
    icon: <User className="h-6 w-6" />,
  },
  {
    role: "procurement",
    label: "Procurement",
    description: "Manage and process incoming purchase requests.",
    icon: <ShoppingCart className="h-6 w-6" />,
  },
  {
    role: "head-of-category",
    label: "Head of Category",
    description: "Oversee category strategies and supplier decisions.",
    icon: <Tag className="h-6 w-6" />,
  },
  {
    role: "head-of-strategic-sourcing",
    label: "Head of Strategic Sourcing",
    description: "Drive sourcing initiatives and vendor negotiations.",
    icon: <TrendingUp className="h-6 w-6" />,
  },
  {
    role: "cpo",
    label: "CPO",
    description: "Full visibility across all procurement operations.",
    icon: <Briefcase className="h-6 w-6" />,
  },
]

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Select your role</CardTitle>
          <CardDescription>Choose how you want to access the dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {roles.map(({ role, label, description, icon }) => (
            <form key={role} action={selectRole.bind(null, role, label)}>
              <Button
                type="submit"
                variant="outline"
                className="w-full h-auto justify-start gap-4 px-4 py-3"
              >
                <span className="text-muted-foreground">{icon}</span>
                <span className="flex flex-col items-start gap-0.5">
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-xs text-muted-foreground font-normal">{description}</span>
                </span>
              </Button>
            </form>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
