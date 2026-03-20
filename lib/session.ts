import { getIronSession } from "iron-session"
import { cookies } from "next/headers"

export type Role = "client" | "procurement" | "head-of-category" | "head-of-strategic-sourcing" | "cpo"

export type SessionData = {
  userId?: string
  role?: Role
  roleLabel?: string
  isLoggedIn: boolean
}

const sessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: "app-session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
  },
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions)
}
