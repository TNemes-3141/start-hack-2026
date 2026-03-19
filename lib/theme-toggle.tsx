"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ThemeToggleProps = {
  className?: string
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const isDark = resolvedTheme === "dark"

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="outline"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn("fixed top-4 right-4 z-50 shadow-sm", className)}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}
