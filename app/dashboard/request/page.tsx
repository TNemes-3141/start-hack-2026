"use client"

import { redirect } from "next/navigation"

export default function RequestPage() {
  redirect("/dashboard/open-requests")
}
