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
      <SidebarHeader className="p-4">
        <div className={`flex items-center gap-2 ${state === "collapsed" ? "justify-center" : ""}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          {state === "expanded" && (
            <span className="font-semibold text-sm">Penrose</span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Requests</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map(({ label, href, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(href)}
                    tooltip={label}
                    className="bg-sidebar-foreground text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar data-[active=true]:text-sidebar-foreground"
                  >
                    <Link href={href}>
                      <Icon className="h-4 w-4" />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {role === "procurement" && (
        <SidebarFooter className="p-3">
          <NewRequestDialog />
        </SidebarFooter>
      )}
    </Sidebar>
  )
}

function AppHeader({ roleLabel }: { roleLabel?: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center border-b bg-background px-4 gap-2">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-4" />
      <div className="flex-1" />
      <Link href="/procurement" className="flex items-center gap-3 rounded-md px-2 py-1 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
        {roleLabel && (
          <p className="text-sm font-medium hidden sm:block">{roleLabel}</p>
        )}
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs">
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
