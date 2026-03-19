"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronDown } from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────────────

export type ClientRequestForm = {
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

export type FormOptions = {
  request_language_options: string[]
  category_l1_options: string[]
  category_l2_by_l1: Record<string, string[]>
  country_options: string[]
  city_options: string[]
  currency_options: string[]
}

// ── Constants ──────────────────────────────────────────────────────────────────

export const EMPTY_FORM: ClientRequestForm = {
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

export const EMPTY_OPTIONS: FormOptions = {
  request_language_options: [],
  category_l1_options: [],
  category_l2_by_l1: {},
  country_options: [],
  city_options: [],
  currency_options: [],
}

export const REQUIRED_FIELDS: Array<keyof ClientRequestForm> = [
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

export const CONTRACT_TYPE_OPTIONS = ["purchase", "sell"]

// ── Helpers ────────────────────────────────────────────────────────────────────

export function mergeSelectOptions(options: string[], current: string): string[] {
  if (!current || options.includes(current)) return options
  return [current, ...options]
}

export function mergeMultiSelectOptions(options: string[], current: string[]): string[] {
  const missing = current.filter((v) => !options.includes(v))
  return [...missing, ...options]
}

// ── Primitive field components ─────────────────────────────────────────────────

export function TextField({
  label, value, onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
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

export function SelectField({
  label, value, options, onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
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

export function NumberField({
  label, value, onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
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

export function DateField({
  label, value, onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
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

export function MultiSelectCombobox({
  label, values, options, onChange,
}: {
  label: string
  values: string[]
  options: string[]
  onChange: (values: string[]) => void
}) {
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
        aria-expanded={open}
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
          <div className="max-h-44 overflow-y-auto rounded-md border border-border">
            {filtered.length === 0
              ? <p className="px-3 py-2 text-sm text-muted-foreground">No countries found.</p>
              : filtered.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => toggle(o)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
                >
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

// ── Loading skeleton ───────────────────────────────────────────────────────────

export function LoadingSkeletonCard() {
  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <p className="mb-4 text-sm font-medium text-foreground">Analyzing your request...</p>
      <div className="space-y-3 animate-pulse">
        <div className="h-4 w-48 rounded bg-muted" />
        <div className="h-24 w-full rounded-md bg-muted" />
        <div className="mt-2 h-10 w-40 rounded-md bg-muted" />
      </div>
    </section>
  )
}

// ── Full form grid ─────────────────────────────────────────────────────────────
// Renders all request fields: the 2-column grid, ESG checkbox, and request text textarea.
// The parent is responsible for the heading, status banners, and submit button.

export function RequestFormGrid({
  form,
  formOptions,
  onChange,
}: {
  form: ClientRequestForm
  formOptions: FormOptions
  onChange: (updated: ClientRequestForm) => void
}) {
  const categoryL2Options = useMemo(
    () => formOptions.category_l2_by_l1[form.category_l1] ?? [],
    [form.category_l1, formOptions.category_l2_by_l1],
  )

  function patch(partial: Partial<ClientRequestForm>) {
    onChange({ ...form, ...partial })
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField
          label="Request Language"
          value={form.request_language}
          options={mergeSelectOptions(formOptions.request_language_options, form.request_language)}
          onChange={(v) => patch({ request_language: v })}
        />
        <TextField label="Business Unit" value={form.business_unit} onChange={(v) => patch({ business_unit: v })} />
        <SelectField
          label="Country"
          value={form.country}
          options={mergeSelectOptions(formOptions.country_options, form.country)}
          onChange={(v) => patch({ country: v })}
        />
        <SelectField
          label="City"
          value={form.city}
          options={mergeSelectOptions(formOptions.city_options, form.city)}
          onChange={(v) => patch({ city: v })}
        />
        <TextField label="Requester Role" value={form.requester_role} onChange={(v) => patch({ requester_role: v })} />
        <SelectField
          label="Category (L1)"
          value={form.category_l1}
          options={mergeSelectOptions(formOptions.category_l1_options, form.category_l1)}
          onChange={(v) => {
            const nextL2 = (formOptions.category_l2_by_l1[v] ?? []).includes(form.category_l2) ? form.category_l2 : ""
            patch({ category_l1: v, category_l2: nextL2 })
          }}
        />
        <SelectField
          label="Subcategory (L2)"
          value={form.category_l2}
          options={mergeSelectOptions(categoryL2Options, form.category_l2)}
          onChange={(v) => patch({ category_l2: v })}
        />
        <TextField label="Request Title" value={form.title} onChange={(v) => patch({ title: v })} />
        <SelectField
          label="Currency"
          value={form.currency}
          options={mergeSelectOptions(formOptions.currency_options, form.currency)}
          onChange={(v) => patch({ currency: v })}
        />
        <NumberField label="Budget Amount" value={form.budget_amount} onChange={(v) => patch({ budget_amount: v })} />
        <NumberField label="Quantity" value={form.quantity} onChange={(v) => patch({ quantity: v })} />
        <TextField label="Unit of Measure" value={form.unit_of_measure} onChange={(v) => patch({ unit_of_measure: v })} />
        <DateField label="Required By Date" value={form.required_by_date} onChange={(v) => patch({ required_by_date: v })} />
        <TextField
          label="Preferred Supplier Mentioned"
          value={form.preferred_supplier_mentioned}
          onChange={(v) => patch({ preferred_supplier_mentioned: v })}
        />
        <TextField label="Incumbent Supplier" value={form.incumbent_supplier} onChange={(v) => patch({ incumbent_supplier: v })} />
        <SelectField
          label="Contract Type Requested"
          value={form.contract_type_requested}
          options={mergeSelectOptions(CONTRACT_TYPE_OPTIONS, form.contract_type_requested)}
          onChange={(v) => patch({ contract_type_requested: v })}
        />
        <MultiSelectCombobox
          label="Delivery Countries"
          values={form.delivery_countries}
          options={mergeMultiSelectOptions(formOptions.country_options, form.delivery_countries)}
          onChange={(values) => patch({ delivery_countries: values })}
        />
      </div>

      <div className="mt-4">
        <label className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
          <input
            type="checkbox"
            checked={form.esg_requirement}
            onChange={(e) => patch({ esg_requirement: e.target.checked })}
            className="size-4 rounded border-input"
          />
          ESG Requirement
        </label>
      </div>

      <div className="mt-4">
        <label htmlFor="request-text" className="mb-2 block text-sm font-medium text-foreground">
          Request Details
        </label>
        <textarea
          id="request-text"
          value={form.request_text}
          onChange={(e) => patch({ request_text: e.target.value })}
          rows={4}
          className="w-full rounded-md border border-input bg-background p-3 text-sm text-foreground focus:border-ring focus:outline-none"
        />
      </div>
    </>
  )
}
