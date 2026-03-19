"use client"

import { User, ShoppingCart, Tag, TrendingUp, Briefcase } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { selectRole } from "@/app/actions"
import type { Role } from "@/lib/session"
import Dither from "@/components/Dither"
import Dot from "@/components/animata/background/dot"

const roles: { role: Role; label: string; description: string; icon: React.ReactNode }[] = [
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 z-0">
        <Dot className="absolute inset-0 opacity-15" spacing={30} />
        <Dither
          waveColor={[0.5, 0.5, 0.5]}
          disableAnimation={false}
          enableMouseInteraction
          mouseRadius={0.3}
          colorNum={4}
          waveAmplitude={0.3}
          waveFrequency={3}
          waveSpeed={0.05}
          className="absolute inset-0 opacity-15"
        />
      </div>

      <Card className="relative z-10 w-full max-w-md">
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
