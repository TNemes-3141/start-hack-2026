"use client"

import { ShoppingCart, Tag, TrendingUp, Briefcase } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { selectRole } from "@/app/actions"
import type { Role } from "@/lib/session"
import Dither from "@/components/Dither"
import Dot from "@/components/animata/background/dot"

const roles: {
  role: Role
  label: string
  description: string
  icon: React.ReactNode
  gradient: string
  glow: string
}[] = [
  {
    role: "procurement",
    label: "Procurement",
    description: "Manage and process incoming purchase requests.",
    icon: <ShoppingCart className="h-5 w-5" />,
    gradient: "from-indigo-500 to-violet-600",
    glow: "group-hover:shadow-indigo-500/30",
  },
  {
    role: "head-of-category",
    label: "Head of Category",
    description: "Oversee category strategies and supplier decisions.",
    icon: <Tag className="h-5 w-5" />,
    gradient: "from-cyan-500 to-blue-600",
    glow: "group-hover:shadow-cyan-500/30",
  },
  {
    role: "head-of-strategic-sourcing",
    label: "Head of Strategic Sourcing",
    description: "Drive sourcing initiatives and vendor negotiations.",
    icon: <TrendingUp className="h-5 w-5" />,
    gradient: "from-emerald-500 to-teal-600",
    glow: "group-hover:shadow-emerald-500/30",
  },
  {
    role: "cpo",
    label: "CPO",
    description: "Full visibility across all procurement operations.",
    icon: <Briefcase className="h-5 w-5" />,
    gradient: "from-rose-500 to-pink-600",
    glow: "group-hover:shadow-rose-500/30",
  },
]

export default function Home() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 z-0">
        <Dot className="absolute inset-0 opacity-20" spacing={28} />
        <Dither
          waveColor={[0.3, 0.27, 0.9]}
          disableAnimation={false}
          enableMouseInteraction
          mouseRadius={0.3}
          colorNum={5}
          waveAmplitude={0.35}
          waveFrequency={3}
          waveSpeed={0.05}
          className="absolute inset-0 opacity-20"
        />
      </div>

      <Card className="relative z-10 w-full max-w-md shadow-2xl shadow-black/10 dark:shadow-black/40 border-border/60">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30">
              <span className="text-white font-bold text-lg">P</span>
            </div>
          </div>
          <CardTitle className="text-2xl gradient-text">Select your role</CardTitle>
          <CardDescription className="text-sm">Choose how you want to access the dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2.5">
          {roles.map(({ role, label, description, icon, gradient, glow }) => (
            <form key={role} action={selectRole.bind(null, role, label)}>
              <Button
                type="submit"
                variant="outline"
                className={`group w-full h-auto justify-start gap-4 px-4 py-3.5 border-border hover:border-primary/40 hover:bg-accent transition-all duration-200 hover:shadow-lg ${glow}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${gradient} text-white shadow-md`}>
                  {icon}
                </span>
                <span className="flex flex-col items-start gap-0.5">
                  <span className="text-sm font-semibold text-foreground">{label}</span>
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
