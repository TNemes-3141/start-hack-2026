"use server"

import { redirect } from "next/navigation"
import { getSession, type Role } from "@/lib/session"

export async function selectRole(role: Role, label: string) {
  const session = await getSession()
  session.role = role
  session.roleLabel = label
  session.isLoggedIn = true
  await session.save()
  redirect(role === "client" ? "/client" : "/dashboard")
}
