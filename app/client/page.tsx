"use client"

import { useRouter } from "next/navigation"
import { RequestStoreProvider, useRequestStore } from "@/lib/request-store"
import { RequestFormPage } from "@/components/request-form-page"
import type { ClientRequestForm } from "@/components/request-form-fields"
import type { RequestInterpretation } from "@/lib/request-data"

export default function ClientPage() {
  return (
    <RequestStoreProvider>
      <ClientPageContent />
    </RequestStoreProvider>
  )
}

function ClientPageContent() {
  const router = useRouter()
  const { startPipeline } = useRequestStore()

  function handleSubmit(form: ClientRequestForm) {
    startPipeline(form as RequestInterpretation)
    router.push("/dashboard/request")
  }

  return <RequestFormPage onSubmit={handleSubmit} />
}
