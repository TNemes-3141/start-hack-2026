"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

type ClientRequestForm = {
  request_language: string;
  business_unit: string;
  country: string;
  city: string;
  requester_id: string;
  requester_role: string;
  category_l1: string;
  category_l2: string;
  title: string;
  request_text: string;
  currency: string;
  budget_amount: number;
  quantity: number;
  unit_of_measure: string;
  required_by_date: string;
  preferred_supplier_mentioned: string;
  incumbent_supplier: string;
  contract_type_requested: string;
  delivery_countries: string[];
  esg_requirement: boolean;
};

type FormOptions = {
  request_language_options: string[];
  category_l1_options: string[];
  category_l2_by_l1: Record<string, string[]>;
  country_options: string[];
  city_options: string[];
  currency_options: string[];
};

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
};

const EMPTY_OPTIONS: FormOptions = {
  request_language_options: [],
  category_l1_options: [],
  category_l2_by_l1: {},
  country_options: [],
  city_options: [],
  currency_options: [],
};

const FIELD_LABELS: Record<keyof ClientRequestForm, string> = {
  request_language: "Request Language",
  business_unit: "Business Unit",
  country: "Country",
  city: "City",
  requester_id: "Requester ID",
  requester_role: "Requester Role",
  category_l1: "Category (L1)",
  category_l2: "Category (L2)",
  title: "Request Title",
  request_text: "Request Details",
  currency: "Currency",
  budget_amount: "Budget Amount",
  quantity: "Quantity",
  unit_of_measure: "Unit of Measure",
  required_by_date: "Required By Date",
  preferred_supplier_mentioned: "Preferred Supplier Mentioned",
  incumbent_supplier: "Incumbent Supplier",
  contract_type_requested: "Contract Type Requested",
  delivery_countries: "Delivery Countries",
  esg_requirement: "ESG Requirement",
};

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
];

const CONTRACT_TYPE_OPTIONS = ["purchase", "sell"];

export default function ClientPage() {
  const [prompt, setPrompt] = useState(
    "Need 240 docking stations matching existing laptop fleet. Must be delivered by 2026-03-20 with premium specification. Budget capped at 25 199.55 EUR. Please use Dell Enterprise Europe with no exception.",
  );
  const [form, setForm] = useState<ClientRequestForm>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [hasExtractionResult, setHasExtractionResult] = useState(false);
  const [showPromptCard, setShowPromptCard] = useState(true);
  const [isPromptLeaving, setIsPromptLeaving] = useState(false);
  const [showResultCard, setShowResultCard] = useState(false);
  const [isResultVisible, setIsResultVisible] = useState(false);
  const [formOptions, setFormOptions] = useState<FormOptions>(EMPTY_OPTIONS);

  const canExtract = useMemo(() => !isLoading && prompt.trim().length > 0, [
    isLoading,
    prompt,
  ]);

  const categoryL2Options = useMemo(() => {
    return formOptions.category_l2_by_l1[form.category_l1] ?? [];
  }, [form.category_l1, formOptions.category_l2_by_l1]);

  const missingFields = useMemo(() => {
    if (!hasExtractionResult) {
      return [] as string[];
    }

    const missing: string[] = [];

    REQUIRED_FIELDS.forEach((key) => {
      const value = form[key];

      if (typeof value === "string" && !value.trim()) {
        missing.push(FIELD_LABELS[key]);
        return;
      }

      if (typeof value === "number" && value <= 0) {
        missing.push(FIELD_LABELS[key]);
        return;
      }

      if (Array.isArray(value) && value.length === 0) {
        missing.push(FIELD_LABELS[key]);
      }
    });

    return missing;
  }, [form, hasExtractionResult]);

  const hasMissingInfo = missingFields.length > 0;

  useEffect(() => {
    async function loadOptions() {
      try {
        const response = await fetch("/api/client/options");
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as FormOptions;
        setFormOptions(payload);
      } catch {
        setFormOptions(EMPTY_OPTIONS);
      }
    }

    void loadOptions();
  }, []);

  async function handleExtract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/client/parse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      const payload = (await response.json()) as {
        error?: string;
        data?: ClientRequestForm;
      };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error || "Unable to extract request data.");
      }

      setForm(payload.data);
      setIsPromptLeaving(true);
      window.setTimeout(() => {
        setHasExtractionResult(true);
        setShowPromptCard(false);
        setShowResultCard(true);
        setIsPromptLeaving(false);
        window.requestAnimationFrame(() => {
          setIsResultVisible(true);
        });
      }, 280);
    } catch (error) {
      setHasExtractionResult(false);
      setShowPromptCard(true);
      setShowResultCard(false);
      setIsPromptLeaving(false);
      setIsResultVisible(false);
      setErrorMessage(
        error instanceof Error ? error.message : "Unexpected parsing error.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-10 text-zinc-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Client Procurement Request
          </h1>
        </header>

        {showPromptCard ? (
          <div className="relative min-h-[290px]">
            <form
              onSubmit={handleExtract}
              className={`rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition-all duration-300 ease-out ${
                isLoading
                  ? "pointer-events-none -translate-y-1 scale-[0.99] opacity-0"
                  : isPromptLeaving
                    ? "pointer-events-none -translate-y-1 scale-[0.99] opacity-0"
                    : "translate-y-0 scale-100 opacity-100"
              }`}
            >
              <label
                htmlFor="request-prompt"
                className="mb-2 block text-sm font-medium text-zinc-800"
              >
                Natural language request
              </label>
              <textarea
                id="request-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={5}
                className="w-full rounded-md border border-zinc-300 p-3 text-sm focus:border-zinc-500 focus:outline-none"
                placeholder="Describe your procurement need in natural language..."
              />

              <div className="mt-4 flex items-center gap-4">
                <button
                  type="submit"
                  disabled={!canExtract}
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Extract fields with OpenAI
                </button>
                {errorMessage ? (
                  <p className="text-sm text-red-600">{errorMessage}</p>
                ) : null}
              </div>
            </form>

            <div
              className={`absolute inset-0 transition-all duration-300 ease-out ${
                isLoading
                  ? "translate-y-0 scale-100 opacity-100"
                  : "pointer-events-none translate-y-1 scale-[0.99] opacity-0"
              }`}
            >
              <LoadingSkeletonCard />
            </div>
          </div>
        ) : null}

        {showResultCard && hasExtractionResult && hasMissingInfo ? (
          <section
            className={`space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm transition-all duration-300 ease-out ${
              isResultVisible
                ? "translate-y-0 scale-100 opacity-100"
                : "translate-y-1 scale-[0.99] opacity-0"
            }`}
          >
            <div className="rounded-md border border-amber-300 bg-amber-100 p-3 text-sm text-amber-900">
              We are missing some required information. Please review and complete
              the fields below.
            </div>
            <p className="text-sm text-amber-900">
              Missing fields: {missingFields.join(", ")}
            </p>

            <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="mb-5 text-xl font-semibold">Structured Request Form</h2>

              <div className="grid gap-4 md:grid-cols-2">
                <SelectField
                  label="Request Language"
                  value={form.request_language}
                  options={mergeSelectOptions(
                    formOptions.request_language_options,
                    form.request_language,
                  )}
                  onChange={(value) => setForm({ ...form, request_language: value })}
                />
                <TextField
                  label="Business Unit"
                  value={form.business_unit}
                  onChange={(value) => setForm({ ...form, business_unit: value })}
                />
                <SelectField
                  label="Country"
                  value={form.country}
                  options={mergeSelectOptions(
                    formOptions.country_options,
                    form.country,
                  )}
                  onChange={(value) => setForm({ ...form, country: value })}
                />
                <SelectField
                  label="City"
                  value={form.city}
                  options={mergeSelectOptions(formOptions.city_options, form.city)}
                  onChange={(value) => setForm({ ...form, city: value })}
                />
                <TextField
                  label="Requester Role"
                  value={form.requester_role}
                  onChange={(value) => setForm({ ...form, requester_role: value })}
                />
                <SelectField
                  label="Category (L1)"
                  value={form.category_l1}
                  options={mergeSelectOptions(
                    formOptions.category_l1_options,
                    form.category_l1,
                  )}
                  onChange={(value) => {
                    const nextL2Options = formOptions.category_l2_by_l1[value] ?? [];
                    const nextL2 = nextL2Options.includes(form.category_l2)
                      ? form.category_l2
                      : "";

                    setForm({
                      ...form,
                      category_l1: value,
                      category_l2: nextL2,
                    });
                  }}
                />
                <SelectField
                  label="Subcategory (L2)"
                  value={form.category_l2}
                  options={mergeSelectOptions(categoryL2Options, form.category_l2)}
                  onChange={(value) => setForm({ ...form, category_l2: value })}
                />
                <TextField
                  label="Request Title"
                  value={form.title}
                  onChange={(value) => setForm({ ...form, title: value })}
                />
                <SelectField
                  label="Currency"
                  value={form.currency}
                  options={mergeSelectOptions(
                    formOptions.currency_options,
                    form.currency,
                  )}
                  onChange={(value) => setForm({ ...form, currency: value })}
                />
                <NumberField
                  label="Budget Amount"
                  value={form.budget_amount}
                  onChange={(value) => setForm({ ...form, budget_amount: value })}
                />
                <NumberField
                  label="Quantity"
                  value={form.quantity}
                  onChange={(value) => setForm({ ...form, quantity: value })}
                />
                <TextField
                  label="Unit of Measure"
                  value={form.unit_of_measure}
                  onChange={(value) => setForm({ ...form, unit_of_measure: value })}
                />
                <DateField
                  label="Required By Date"
                  value={form.required_by_date}
                  onChange={(value) => setForm({ ...form, required_by_date: value })}
                />
                <TextField
                  label="Preferred Supplier Mentioned"
                  value={form.preferred_supplier_mentioned}
                  onChange={(value) =>
                    setForm({ ...form, preferred_supplier_mentioned: value })
                  }
                />
                <TextField
                  label="Incumbent Supplier"
                  value={form.incumbent_supplier}
                  onChange={(value) =>
                    setForm({ ...form, incumbent_supplier: value })
                  }
                />
                <SelectField
                  label="Contract Type Requested"
                  value={form.contract_type_requested}
                  options={mergeSelectOptions(
                    CONTRACT_TYPE_OPTIONS,
                    form.contract_type_requested,
                  )}
                  onChange={(value) =>
                    setForm({ ...form, contract_type_requested: value })
                  }
                />
                <MultiSelectCombobox
                  label="Delivery Countries"
                  values={form.delivery_countries}
                  options={mergeMultiSelectOptions(
                    formOptions.country_options,
                    form.delivery_countries,
                  )}
                  onChange={(values) =>
                    setForm({ ...form, delivery_countries: values })
                  }
                />
              </div>

              <div className="mt-4">
                <label className="inline-flex items-center gap-2 text-sm font-medium text-zinc-800">
                  <input
                    type="checkbox"
                    checked={form.esg_requirement}
                    onChange={(event) =>
                      setForm({ ...form, esg_requirement: event.target.checked })
                    }
                    className="size-4 rounded border-zinc-300"
                  />
                  ESG Requirement
                </label>
              </div>

              <div className="mt-4">
                <label
                  htmlFor="request-text"
                  className="mb-2 block text-sm font-medium text-zinc-800"
                >
                  Request Details
                </label>
                <textarea
                  id="request-text"
                  value={form.request_text}
                  onChange={(event) =>
                    setForm({ ...form, request_text: event.target.value })
                  }
                  rows={4}
                  className="w-full rounded-md border border-zinc-300 p-3 text-sm focus:border-zinc-500 focus:outline-none"
                />
              </div>
            </div>
          </section>
        ) : null}

        {showResultCard && hasExtractionResult && !hasMissingInfo ? (
          <section
            className={`rounded-xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm transition-all duration-300 ease-out ${
              isResultVisible
                ? "translate-y-0 scale-100 opacity-100"
                : "translate-y-1 scale-[0.99] opacity-0"
            }`}
          >
            <p className="text-sm text-emerald-900">
              Thanks. We have all required information from your request.
            </p>
          </section>
        ) : null}
      </div>
    </main>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

function TextField({ label, value, onChange }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-800">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
      />
    </label>
  );
}

type SelectFieldProps = {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
};

function SelectField({ label, value, options, onChange }: SelectFieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-800">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
      >
        <option value="">Select...</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

type MultiSelectFieldProps = {
  label: string;
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
};

function MultiSelectCombobox({
  label,
  values,
  options,
  onChange,
}: MultiSelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return options;
    }
    return options.filter((option) =>
      option.toLowerCase().includes(normalizedQuery),
    );
  }, [options, query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  function toggleValue(value: string) {
    if (values.includes(value)) {
      onChange(values.filter((item) => item !== value));
      return;
    }
    onChange([...values, value]);
  }

  return (
    <div className="block" ref={containerRef}>
      <span className="mb-1 block text-sm font-medium text-zinc-800">{label}</span>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex w-full items-center justify-between gap-2 rounded-md border border-zinc-300 px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
          aria-expanded={open}
        >
          <span className="truncate">
            {values.length > 0 ? values.join(", ") : "Select from country list"}
          </span>
          <ChevronDown className="size-4 shrink-0 text-zinc-500" />
        </button>

        {open ? (
          <div className="mt-2 rounded-md border border-zinc-200 bg-white p-2 shadow-sm">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search countries..."
              className="mb-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            />
            <div className="max-h-44 overflow-y-auto rounded-md border border-zinc-200">
              {filteredOptions.length === 0 ? (
                <p className="px-3 py-2 text-sm text-zinc-500">No countries found.</p>
              ) : (
                filteredOptions.map((option) => {
                  const isSelected = values.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => toggleValue(option)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-50"
                    >
                      <span>{option}</span>
                      {isSelected ? <Check className="size-4 text-zinc-700" /> : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : null}
    </div>
  );
}

type NumberFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
};

function NumberField({ label, value, onChange }: NumberFieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-800">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
      />
    </label>
  );
}

type DateFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

function DateField({ label, value, onChange }: DateFieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-800">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
      />
    </label>
  );
}

function mergeSelectOptions(options: string[], currentValue: string): string[] {
  if (!currentValue || options.includes(currentValue)) {
    return options;
  }
  return [currentValue, ...options];
}

function mergeMultiSelectOptions(
  options: string[],
  currentValues: string[],
): string[] {
  const missingCurrent = currentValues.filter((value) => !options.includes(value));
  return [...missingCurrent, ...options];
}

function LoadingSkeletonCard() {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <p className="mb-4 text-sm font-medium text-zinc-700">
        Analyzing your request...
      </p>
      <div className="space-y-3 animate-pulse">
        <div className="h-4 w-48 rounded bg-zinc-200" />
        <div className="h-24 w-full rounded-md bg-zinc-200" />
        <div className="mt-2 h-10 w-40 rounded-md bg-zinc-200" />
      </div>
    </section>
  );
}
