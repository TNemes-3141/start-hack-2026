"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { SendHorizontal } from "lucide-react"
import { PageBackground } from "@/components/page-background"
import {
  type ClientRequestForm,
  type FormOptions,
  EMPTY_FORM,
  EMPTY_OPTIONS,
  REQUIRED_FIELDS,
  RequestFormGrid,
  LoadingSkeletonCard,
} from "@/components/request-form-fields"
import { FIELD_LABELS } from "@/lib/request-data"

// Full-page prompt → structured form experience.
// Used by /client and /dashboard/new-request.
// The caller provides onSubmit and an optional pre-filled initialForm.

export function RequestFormPage({
  onSubmit,
  initialForm,
}: {
  onSubmit: (form: ClientRequestForm) => void
  initialForm?: ClientRequestForm
}) {
  const prefilled = !!initialForm

  const [prompt, setPrompt] = useState("")
  const [form, setForm] = useState<ClientRequestForm>(initialForm ?? EMPTY_FORM)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [hasResult, setHasResult] = useState(prefilled)
  const [showPromptCard, setShowPromptCard] = useState(!prefilled)
  const [isPromptLeaving, setIsPromptLeaving] = useState(false)
  const [showResultCard, setShowResultCard] = useState(prefilled)
  const [isResultVisible, setIsResultVisible] = useState(prefilled)
  const [formOptions, setFormOptions] = useState<FormOptions>(EMPTY_OPTIONS)

  const canExtract = !isLoading && prompt.trim().length > 0

  const missingFields = useMemo(() => {
    if (!hasResult) return [] as string[]
    const missing: string[] = []
    REQUIRED_FIELDS.forEach((key) => {
      const value = form[key]
      if (typeof value === "string" && !value.trim()) { missing.push(FIELD_LABELS[key]); return }
      if (typeof value === "number" && value <= 0) { missing.push(FIELD_LABELS[key]); return }
      if (Array.isArray(value) && value.length === 0) missing.push(FIELD_LABELS[key])
    })
    return missing
  }, [form, hasResult])

  useEffect(() => {
    void fetch("/api/client/options")
      .then((r) => (r.ok ? r.json() : EMPTY_OPTIONS))
      .then((payload: FormOptions) => setFormOptions(payload))
      .catch(() => {})
  }, [])

  async function handleExtract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage("")
    setIsLoading(true)
    try {
      const res = await fetch("/api/client/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      })
      const payload = (await res.json()) as { error?: string; data?: ClientRequestForm }
      if (!res.ok || !payload.data) throw new Error(payload.error ?? "Unable to extract request data.")
      setForm(payload.data)
      setIsPromptLeaving(true)
      window.setTimeout(() => {
        setHasResult(true)
        setShowPromptCard(false)
        setShowResultCard(true)
        setIsPromptLeaving(false)
        window.requestAnimationFrame(() => setIsResultVisible(true))
      }, 280)
    } catch (error) {
      setHasResult(false)
      setShowPromptCard(true)
      setShowResultCard(false)
      setIsPromptLeaving(false)
      setIsResultVisible(false)
      setErrorMessage(error instanceof Error ? error.message : "Unexpected parsing error.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground transition-colors">
      <PageBackground />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">

        {/* Step 1: Prompt input */}
        {showPromptCard && (
          <div className="flex flex-1 items-center justify-center">
            <div className="relative w-full max-w-3xl">
              <form
                onSubmit={handleExtract}
                className={`space-y-6 transition-all duration-300 ease-out ${
                  isLoading || isPromptLeaving
                    ? "pointer-events-none -translate-y-1 scale-[0.99] opacity-0"
                    : "translate-y-0 scale-100 opacity-100"
                }`}
              >
                <h1 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">
                  Hi, what procurement would you like to request?
                </h1>
                <div className="rounded-2xl border border-border bg-card/90 p-2 shadow-sm backdrop-blur">
                  <div className="flex items-center gap-2">
                    <input
                      id="request-prompt"
                      type="text"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      className="h-12 w-full rounded-xl border border-transparent bg-transparent px-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
                      placeholder="Describe your procurement request..."
                    />
                    <button
                      type="submit"
                      disabled={!canExtract}
                      aria-label="Send request"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <SendHorizontal className="size-4" />
                    </button>
                  </div>
                </div>
                {errorMessage && (
                  <p className="text-center text-sm text-destructive">{errorMessage}</p>
                )}
              </form>

              <div
                className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ease-out ${
                  isLoading
                    ? "translate-y-0 scale-100 opacity-100"
                    : "pointer-events-none translate-y-1 scale-[0.99] opacity-0"
                }`}
              >
                <LoadingSkeletonCard />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Review and submit */}
        {showResultCard && hasResult && (
          <section
            className={`space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm transition-all duration-300 ease-out ${
              isResultVisible
                ? "translate-y-0 scale-100 opacity-100"
                : "translate-y-1 scale-[0.99] opacity-0"
            }`}
          >
            {missingFields.length > 0 ? (
              <>
                <div className="rounded-md border border-border bg-muted p-3 text-sm text-foreground">
                  We are missing some required information. Please review and complete the fields below.
                </div>
                <p className="text-sm text-muted-foreground">Missing fields: {missingFields.join(", ")}</p>
              </>
            ) : (
              <p className="rounded-md border border-border bg-muted p-3 text-sm text-foreground">
                All required information is present. Press Submit Request to continue.
              </p>
            )}

            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="mb-5 text-xl font-semibold">Structured Request Form</h2>
              <RequestFormGrid form={form} formOptions={formOptions} onChange={setForm} />
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => onSubmit(form)}
                  disabled={missingFields.length > 0}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Submit Request
                </button>
              </div>
            </div>
          </section>
        )}

      </div>
    </main>
  )
}
