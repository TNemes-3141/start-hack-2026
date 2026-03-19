"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useRequestStore } from "@/lib/request-store"
import { RequestFormPage } from "@/components/request-form-page"
import type { ClientRequestForm } from "@/components/request-form-fields"
import type { RequestInterpretation } from "@/lib/request-data"

export default function NewRequestPage() {
  const router = useRouter()
  const { startPipeline } = useRequestStore()
  const [initialForm, setInitialForm] = useState<ClientRequestForm | undefined>()
  const [ready, setReady] = useState(false)

  // Read any pre-parsed form data passed via localStorage (e.g. from the client page).
  useEffect(() => {
    const stored = localStorage.getItem("parsed_request")
    if (stored) {
      localStorage.removeItem("parsed_request")
      try {
        setInitialForm(JSON.parse(stored) as ClientRequestForm)
      } catch {
        // ignore malformed data
      }
    }
    setReady(true)
  }, [])

  function handleSubmit(form: ClientRequestForm) {
    void startPipeline(form as RequestInterpretation)
    router.push("/dashboard/request")
  }

  if (!ready) return null

  return <RequestFormPage onSubmit={handleSubmit} initialForm={initialForm} />
}
