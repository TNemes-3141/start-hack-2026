"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronDown, Plus, SendHorizontal } from "lucide-react"
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

type ClientRequestForm = {
  request_language: string
  business_unit: string
  country: string
  city: string
  requester_id: string
  requester_role: string
  category_l1: string
  category_l2: string
  title: string
  request_text: string
  currency: string
  budget_amount: number
  quantity: number
  unit_of_measure: string
  required_by_date: string
  preferred_supplier_mentioned: string
  incumbent_supplier: string
  contract_type_requested: string
  delivery_countries: string[]
  esg_requirement: boolean
}

type FormOptions = {
  request_language_options: string[]
  category_l1_options: string[]
  category_l2_by_l1: Record<string, string[]>
  country_options: string[]
  city_options: string[]
  currency_options: string[]
}

const EMPTY_FORM: ClientRequestForm = {
  request_language: "",
  business_unit: "",
  country: "",
  city: "",
  requester_id: "",
  requester_role: "",
  category_l1: "",
  category_l2: "",
  title: "",
  request_text: "",
  currency: "",
  budget_amount: 0,
  quantity: 0,
  unit_of_measure: "",
  required_by_date: "",
  preferred_supplier_mentioned: "",
  incumbent_supplier: "",
  contract_type_requested: "",
  delivery_countries: [],
  esg_requirement: false,
}

const EMPTY_OPTIONS: FormOptions = {
  request_language_options: [],
  category_l1_options: [],
  category_l2_by_l1: {},
  country_options: [],
  city_options: [],
  currency_options: [],
}

const REQUIRED_FIELDS: Array<keyof ClientRequestForm> = [
  "request_language",
  "business_unit",
  "country",
  "city",
  "requester_role",
  "category_l1",
  "category_l2",
  "title",
  "request_text",
  "currency",
  "budget_amount",
  "quantity",
  "unit_of_measure",
  "required_by_date",
  "preferred_supplier_mentioned",
  "incumbent_supplier",
  "contract_type_requested",
  "delivery_countries",
]

const CONTRACT_TYPE_OPTIONS = ["purchase", "sell"]

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
    async function loadOptions() {
      try {
        const res = await fetch("/api/client/options")
        if (!res.ok) return
        const payload = (await res.json()) as FormOptions
        setFormOptions(payload)
      } catch {
        // leave empty
      }
    }
    void loadOptions()
  }, [])

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      // reset on close
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

  function handleSubmit() {
    startPipeline(form as RequestInterpretation)
    handleOpenChange(false)
    router.push("/dashboard/request")
  }

  const categoryL2Options = useMemo(
    () => formOptions.category_l2_by_l1[form.category_l1] ?? [],
    [form.category_l1, formOptions.category_l2_by_l1],
  )

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
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                label="Request Language"
                value={form.request_language}
                options={mergeSelectOptions(formOptions.request_language_options, form.request_language)}
                onChange={(v) => setForm({ ...form, request_language: v })}
              />
              <TextField label="Business Unit" value={form.business_unit} onChange={(v) => setForm({ ...form, business_unit: v })} />
              <SelectField
                label="Country"
                value={form.country}
                options={mergeSelectOptions(formOptions.country_options, form.country)}
                onChange={(v) => setForm({ ...form, country: v })}
              />
              <SelectField
                label="City"
                value={form.city}
                options={mergeSelectOptions(formOptions.city_options, form.city)}
                onChange={(v) => setForm({ ...form, city: v })}
              />
              <TextField label="Requester Role" value={form.requester_role} onChange={(v) => setForm({ ...form, requester_role: v })} />
              <SelectField
                label="Category (L1)"
                value={form.category_l1}
                options={mergeSelectOptions(formOptions.category_l1_options, form.category_l1)}
                onChange={(v) => {
                  const nextL2Options = formOptions.category_l2_by_l1[v] ?? []
                  setForm({ ...form, category_l1: v, category_l2: nextL2Options.includes(form.category_l2) ? form.category_l2 : "" })
                }}
              />
              <SelectField
                label="Subcategory (L2)"
                value={form.category_l2}
                options={mergeSelectOptions(categoryL2Options, form.category_l2)}
                onChange={(v) => setForm({ ...form, category_l2: v })}
              />
              <TextField label="Request Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
              <SelectField
                label="Currency"
                value={form.currency}
                options={mergeSelectOptions(formOptions.currency_options, form.currency)}
                onChange={(v) => setForm({ ...form, currency: v })}
              />
              <NumberField label="Budget Amount" value={form.budget_amount} onChange={(v) => setForm({ ...form, budget_amount: v })} />
              <NumberField label="Quantity" value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v })} />
              <TextField label="Unit of Measure" value={form.unit_of_measure} onChange={(v) => setForm({ ...form, unit_of_measure: v })} />
              <DateField label="Required By Date" value={form.required_by_date} onChange={(v) => setForm({ ...form, required_by_date: v })} />
              <TextField label="Preferred Supplier Mentioned" value={form.preferred_supplier_mentioned} onChange={(v) => setForm({ ...form, preferred_supplier_mentioned: v })} />
              <TextField label="Incumbent Supplier" value={form.incumbent_supplier} onChange={(v) => setForm({ ...form, incumbent_supplier: v })} />
              <SelectField
                label="Contract Type Requested"
                value={form.contract_type_requested}
                options={mergeSelectOptions(CONTRACT_TYPE_OPTIONS, form.contract_type_requested)}
                onChange={(v) => setForm({ ...form, contract_type_requested: v })}
              />
              <MultiSelectCombobox
                label="Delivery Countries"
                values={form.delivery_countries}
                options={mergeMultiSelectOptions(formOptions.country_options, form.delivery_countries)}
                onChange={(values) => setForm({ ...form, delivery_countries: values })}
              />
            </div>

            <div className="mt-4">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={form.esg_requirement}
                  onChange={(e) => setForm({ ...form, esg_requirement: e.target.checked })}
                  className="size-4 rounded border-input"
                />
                ESG Requirement
              </label>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium text-foreground">Request Details</label>
              <textarea
                value={form.request_text}
                onChange={(e) => setForm({ ...form, request_text: e.target.value })}
                rows={4}
                className="w-full rounded-md border border-input bg-background p-3 text-sm text-foreground focus:border-ring focus:outline-none"
              />
            </div>
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

// ── Field components ────────────────────────────────────────────────

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none"
      />
    </label>
  )
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none"
      >
        <option value="">Select...</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none"
      />
    </label>
  )
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none"
      />
    </label>
  )
}

function MultiSelectCombobox({
  label, values, options, onChange,
}: { label: string; values: string[]; options: string[]; onChange: (values: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const containerRef = useRef<HTMLDivElement | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options
  }, [options, query])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener("mousedown", handleClick)
    return () => window.removeEventListener("mousedown", handleClick)
  }, [])

  function toggle(value: string) {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value])
  }

  return (
    <div className="block" ref={containerRef}>
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
      >
        <span className="truncate">{values.length > 0 ? values.join(", ") : "Select from country list"}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="mt-2 rounded-md border border-border bg-popover p-2 shadow-sm">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search countries..."
            className="mb-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none"
          />
          <div className="max-h-36 overflow-y-auto rounded-md border border-border">
            {filtered.length === 0
              ? <p className="px-3 py-2 text-sm text-muted-foreground">No countries found.</p>
              : filtered.map((o) => (
                <button key={o} type="button" onClick={() => toggle(o)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-foreground hover:bg-accent">
                  <span>{o}</span>
                  {values.includes(o) && <Check className="size-4 text-primary" />}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

function mergeSelectOptions(options: string[], current: string) {
  if (!current || options.includes(current)) return options
  return [current, ...options]
}

function mergeMultiSelectOptions(options: string[], current: string[]) {
  const missing = current.filter((v) => !options.includes(v))
  return [...missing, ...options]
}
