"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Building2 } from "lucide-react"
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { TooltipProvider } from "@/components/ui/tooltip"
import { RequestStoreProvider } from "@/lib/request-store"
import { NewRequestDialog } from "@/components/new-request-dialog"
import { getNavItems } from "@/lib/role-config"
import type { Role } from "@/lib/session"

function AppSidebar({ role }: { role?: Role }) {
  const pathname = usePathname()
  const { state } = useSidebar()
  const navItems = getNavItems(role)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className={`flex items-center gap-2.5 ${state === "collapsed" ? "justify-center" : ""}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
            <Building2 className="h-4.5 w-4.5" />
          </div>
          {state === "expanded" && (
            <span className="font-semibold text-sm tracking-tight text-sidebar-foreground">Penrose</span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 px-3 pt-4 pb-1">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map(({ label, href, icon: Icon }) => {
                const isActive = pathname.startsWith(href)
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={label}
                      className={`relative rounded-lg mx-1 transition-all duration-200
                        ${isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
                          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                        }
                      `}
                    >
                      <Link href={href}>
                        {isActive && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-sidebar-primary" />
                        )}
                        <Icon className={`h-4 w-4 ${isActive ? "text-sidebar-primary" : ""}`} />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {role === "procurement" && (
        <SidebarFooter className="p-3 border-t border-sidebar-border">
          <NewRequestDialog />
        </SidebarFooter>
      )}
    </Sidebar>
  )
}

function AppHeader({ roleLabel }: { roleLabel?: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center border-b border-border bg-background/80 glass px-4 gap-2">
      <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground transition-colors" />
      <Separator orientation="vertical" className="h-4 bg-border" />
      <div className="flex-1" />
      <Link
        href="/procurement"
        className="flex items-center gap-3 rounded-lg px-2.5 py-1.5 transition-all duration-200 hover:bg-accent hover:text-accent-foreground"
      >
        {roleLabel && (
          <p className="text-sm font-medium hidden sm:block text-muted-foreground">{roleLabel}</p>
        )}
        <Avatar className="h-8 w-8 ring-2 ring-primary/20">
          <AvatarFallback className="text-xs font-semibold bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
            {roleLabel ? roleLabel.slice(0, 2).toUpperCase() : "?"}
          </AvatarFallback>
        </Avatar>
      </Link>
    </header>
  )
}

export function DashboardShell({
  role,
  roleLabel,
  children,
}: {
  role?: Role
  roleLabel?: string
  children: React.ReactNode
}) {
  return (
    <RequestStoreProvider>
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar role={role} />
          <SidebarInset>
            <AppHeader roleLabel={roleLabel} />
            <main className="flex-1 overflow-auto p-6">
              {children}
            </main>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </RequestStoreProvider>
  )
}
