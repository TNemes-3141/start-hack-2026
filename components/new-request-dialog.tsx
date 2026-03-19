"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, SendHorizontal } from "lucide-react"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { SidebarMenuButton } from "@/components/ui/sidebar"
import { type RequestInterpretation, FIELD_LABELS } from "@/lib/request-data"
import { useRequestStore } from "@/lib/request-store"
import {
  type ClientRequestForm,
  type FormOptions,
  EMPTY_FORM,
  EMPTY_OPTIONS,
  REQUIRED_FIELDS,
  RequestFormGrid,
} from "@/components/request-form-fields"

export function NewRequestDialog({ trigger }: { trigger?: React.ReactNode } = {}) {
  const router = useRouter()
  const { startPipeline } = useRequestStore()

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<"prompt" | "form">("prompt")
  const [prompt, setPrompt] = useState("")
  const [isParsing, setIsParsing] = useState(false)
  const [parseError, setParseError] = useState("")
  const [form, setForm] = useState<ClientRequestForm>(EMPTY_FORM)
  const [formOptions, setFormOptions] = useState<FormOptions>(EMPTY_OPTIONS)

  useEffect(() => {
    void fetch("/api/client/options")
      .then((r) => (r.ok ? r.json() : EMPTY_OPTIONS))
      .then((payload: FormOptions) => setFormOptions(payload))
      .catch(() => {})
  }, [])

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setStep("prompt")
      setPrompt("")
      setParseError("")
      setForm(EMPTY_FORM)
    }
  }

  async function handleParse(e: React.FormEvent) {
    e.preventDefault()
    if (!prompt.trim() || isParsing) return
    setParseError("")
    setIsParsing(true)
    try {
      const res = await fetch("/api/client/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      })
      const payload = (await res.json()) as { error?: string; data?: ClientRequestForm }
      if (!res.ok || !payload.data) throw new Error(payload.error ?? "Unable to parse request.")
      setForm(payload.data)
      setStep("form")
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Unexpected error.")
    } finally {
      setIsParsing(false)
    }
  }

  async function handleSubmit() {
    handleOpenChange(false)
    const id = await startPipeline(form as RequestInterpretation)
    router.push(`/dashboard/open-requests?run=${id}`)
  }

  const missingFields = useMemo(() => {
    if (step !== "form") return []
    const missing: string[] = []
    REQUIRED_FIELDS.forEach((key) => {
      const value = form[key]
      if (typeof value === "string" && !value.trim()) { missing.push(FIELD_LABELS[key]); return }
      if (typeof value === "number" && value <= 0) { missing.push(FIELD_LABELS[key]); return }
      if (Array.isArray(value) && value.length === 0) missing.push(FIELD_LABELS[key])
    })
    return missing
  }, [form, step])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <SidebarMenuButton
            tooltip="New Request"
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
            <span>New Request</span>
          </SidebarMenuButton>
        )}
      </DialogTrigger>

      {step === "prompt" ? (
        <DialogContent className="sm:max-w-lg" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>New Procurement Request</DialogTitle>
            <DialogDescription>
              Describe what you need and we&apos;ll extract the details automatically.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleParse} className="flex flex-col gap-4">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. I need 500 units of office chairs for our Berlin office by end of Q2, budget is 40,000 EUR..."
              rows={5}
              autoFocus
              className="w-full rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none resize-none"
            />
            {parseError && <p className="text-sm text-destructive">{parseError}</p>}
            <DialogFooter>
              <DialogClose asChild>
                <button type="button" className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                  Cancel
                </button>
              </DialogClose>
              <button
                type="submit"
                disabled={!prompt.trim() || isParsing}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <SendHorizontal className="size-4" />
                {isParsing ? "Analyzing…" : "Send"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      ) : (
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Review Structured Request</DialogTitle>
            <DialogDescription>
              {missingFields.length > 0
                ? `Missing fields: ${missingFields.join(", ")}`
                : "All required fields are filled. Submit when ready."}
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 pr-1">
            <RequestFormGrid form={form} formOptions={formOptions} onChange={setForm} />
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setStep("prompt")}
              className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={missingFields.length > 0}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Submit Request
            </button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
