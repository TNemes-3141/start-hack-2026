import { readFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

type ParsedClientRequest = {
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

type ChoiceOptions = {
  request_language_options: string[];
  category_l1_options: string[];
  category_l2_by_l1: Record<string, string[]>;
  typical_unit_by_l1_l2: Record<string, string>;
  country_options: string[];
  city_options: string[];
  currency_options: string[];
  contract_type_options: string[];
};

type RequestRecord = {
  site?: unknown;
  request_language?: unknown;
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULTS: ParsedClientRequest = {
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

const EXTRACTION_KEYS =
  "request_language,business_unit,country,city,requester_id,requester_role,category_l1,category_l2,title,request_text,currency,budget_amount,quantity,unit_of_measure,required_by_date,preferred_supplier_mentioned,incumbent_supplier,contract_type_requested,delivery_countries,esg_requirement";

const EXTRACTION_SYSTEM_PROMPT =
  "You extract procurement request details into strict JSON. " +
  `Return exactly one JSON object with keys: ${EXTRACTION_KEYS}. ` +
  "Use empty string for unknown text fields, 0 for unknown numbers, [] for unknown arrays, false for unknown booleans. " +
  "Infer values from the request text only. " +
  "Detect the input language and set request_language as a lowercase ISO 639-1 code (for example: en, fr, de). " +
  "Output all other textual fields in English consistently, even when the input request is in another language. " +
  "contract_type_requested must be exactly one of: purchase, sell. If not explicit, return empty string. " +
  "Use ISO date format YYYY-MM-DD when a date is known. " +
  `Today's date is ${new Date()}, use this information to fill in the date, if the input is e.g. 'order by the end of next week'` +
  "delivery_countries must be an array of ISO 3166-1 alpha-2 country codes (for example ['DE']). " +
  "Semantic definitions: preferred_supplier_mentioned is a supplier explicitly requested/desired in this specific request; incumbent_supplier is the currently active supplier relationship before this request. " +
  "If there is no explicit evidence of an incumbent supplier, keep incumbent_supplier empty. " +
  "Do not rely on keyword heuristics; infer based on role and context in the sentence. " +
  "For choice fields, use only values from ALLOWED_OPTIONS provided by the user.";

const REVIEW_SYSTEM_PROMPT =
  "You are reviewing a first-pass procurement extraction for semantic correctness. " +
  `Return exactly one corrected JSON object with keys: ${EXTRACTION_KEYS}. ` +
  "Preserve values that are already correct, but fix field-role mistakes. " +
  "Ensure consistent English normalization for all textual fields except request_language, which must be a lowercase ISO 639-1 code for the input language (for example: en, fr, de). " +
  "contract_type_requested must be either 'purchase' or 'sell'. If unknown, return empty string. " +
  "Critically verify supplier roles: preferred_supplier_mentioned must represent the requested supplier in this request, while incumbent_supplier must represent an existing current supplier only if explicitly supported by text. " +
  "Use empty string / 0 / [] / false for unknowns. " +
  "For choice fields, use only values from ALLOWED_OPTIONS provided by the user.";

const DATA_DIR = path.resolve(
  process.cwd(),
  "mockdata",
  "zChainIQ-START-Hack-2026--main",
  "data",
);

let choiceOptionsPromise: Promise<ChoiceOptions> | null = null;

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function parseCategories(csv: string): {
  categoryL1: string[];
  categoryL2ByL1: Record<string, string[]>;
  typicalUnitByL1L2: Record<string, string>;
} {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(",").map((h) => h.trim());
  const l1Idx = headers.indexOf("category_l1");
  const l2Idx = headers.indexOf("category_l2");
  const unitIdx = headers.indexOf("typical_unit");

  const l1Values = new Set<string>();
  const l2ByL1 = new Map<string, Set<string>>();
  const typicalUnitByL1L2: Record<string, string> = {};

  lines.slice(1).forEach((line) => {
    const parts = line.split(",");
    const l1 = parts[l1Idx]?.trim() ?? "";
    const l2 = parts[l2Idx]?.trim() ?? "";
    const unit = unitIdx >= 0 ? (parts[unitIdx]?.trim() ?? "") : "";

    if (!l1 || !l2) {
      return;
    }

    l1Values.add(l1);
    if (!l2ByL1.has(l1)) {
      l2ByL1.set(l1, new Set<string>());
    }
    l2ByL1.get(l1)?.add(l2);

    if (unit) {
      typicalUnitByL1L2[`${l1}|${l2}`] = unit;
    }
  });

  const categoryL2ByL1: Record<string, string[]> = {};
  l2ByL1.forEach((values, key) => {
    categoryL2ByL1[key] = uniqueSorted(Array.from(values));
  });

  return {
    categoryL1: uniqueSorted(Array.from(l1Values)),
    categoryL2ByL1,
    typicalUnitByL1L2,
  };
}

function parseSupplierOptions(csv: string): { countries: string[]; currencies: string[] } {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const countries = new Set<string>();
  const currencies = new Set<string>();

  lines.slice(1).forEach((line) => {
    const parts = line.split(",");
    const countryHq = parts[4]?.trim() ?? "";
    const serviceRegions = parts[5]?.trim() ?? "";
    const currency = parts[6]?.trim() ?? "";

    if (countryHq) {
      countries.add(countryHq);
    }
    if (currency) {
      currencies.add(currency);
    }

    serviceRegions
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((countryCode) => countries.add(countryCode));
  });

  return {
    countries: uniqueSorted(Array.from(countries)),
    currencies: uniqueSorted(Array.from(currencies)),
  };
}

function parseRequestOptions(requestsRaw: string): {
  cities: string[];
  requestLanguages: string[];
} {
  try {
    const requests = JSON.parse(requestsRaw) as RequestRecord[];

    const cities = requests
      .map((item) => (typeof item.site === "string" ? item.site.trim() : ""))
      .filter(Boolean);

    const requestLanguages = requests
      .map((item) =>
        typeof item.request_language === "string"
          ? item.request_language.trim().toLowerCase()
          : "",
      )
      .filter(Boolean);

    return {
      cities: uniqueSorted(cities),
      requestLanguages: uniqueSorted(requestLanguages),
    };
  } catch {
    return {
      cities: [],
      requestLanguages: [],
    };
  }
}

async function getChoiceOptions(): Promise<ChoiceOptions> {
  if (!choiceOptionsPromise) {
    choiceOptionsPromise = (async () => {
      const [categoriesCsv, suppliersCsv, requestsJson] = await Promise.all([
        readFile(path.join(DATA_DIR, "categories.csv"), "utf8"),
        readFile(path.join(DATA_DIR, "suppliers.csv"), "utf8"),
        readFile(path.join(DATA_DIR, "requests.json"), "utf8"),
      ]);

      const categories = parseCategories(categoriesCsv);
      const suppliers = parseSupplierOptions(suppliersCsv);
      const requests = parseRequestOptions(requestsJson);

      return {
        request_language_options: requests.requestLanguages,
        category_l1_options: categories.categoryL1,
        category_l2_by_l1: categories.categoryL2ByL1,
        typical_unit_by_l1_l2: categories.typicalUnitByL1L2,
        country_options: suppliers.countries,
        city_options: requests.cities,
        currency_options: suppliers.currencies,
        contract_type_options: ["purchase", "sell"],
      };
    })().catch((error) => {
      choiceOptionsPromise = null;
      throw error;
    }) as Promise<ChoiceOptions>;
  }

  return choiceOptionsPromise!;
}

function readString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  return "";
}

function readNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.replaceAll(",", "").replace(/[^\d.-]/g, "");
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function readBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const lowered = value.toLowerCase().trim();
    return lowered === "true" || lowered === "yes";
  }
  return false;
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function readContractType(value: unknown): string {
  const normalized = readString(value).toLowerCase();
  if (normalized === "purchase" || normalized === "sell") {
    return normalized;
  }
  return "";
}

function normalizeChoice(value: string, options: string[]): string {
  const normalizedValue = value.trim().toLowerCase();
  if (!normalizedValue) {
    return "";
  }

  const matched = options.find((option) => option.toLowerCase() === normalizedValue);
  return matched ?? "";
}

function normalizeParsedRequest(
  payload: unknown,
  choices: ChoiceOptions,
): ParsedClientRequest {
  const input =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};

  const categoryL1 = normalizeChoice(
    readString(input.category_l1),
    choices.category_l1_options,
  );
  const categoryL2 = normalizeChoice(
    readString(input.category_l2),
    choices.category_l2_by_l1[categoryL1] ?? [],
  );

  const unitOfMeasure =
    readString(input.unit_of_measure) ||
    (categoryL1 && categoryL2
      ? (choices.typical_unit_by_l1_l2[`${categoryL1}|${categoryL2}`] ?? "")
      : "");

  return {
    request_language: normalizeChoice(
      readString(input.request_language),
      choices.request_language_options,
    ),
    business_unit: readString(input.business_unit),
    country: normalizeChoice(readString(input.country), choices.country_options),
    city: normalizeChoice(readString(input.city), choices.city_options),
    requester_id: readString(input.requester_id),
    requester_role: readString(input.requester_role),
    category_l1: categoryL1,
    category_l2: categoryL2,
    title: readString(input.title),
    request_text: readString(input.request_text),
    currency: normalizeChoice(readString(input.currency), choices.currency_options),
    budget_amount: readNumber(input.budget_amount),
    quantity: readNumber(input.quantity),
    unit_of_measure: unitOfMeasure,
    required_by_date: readString(input.required_by_date),
    preferred_supplier_mentioned: readString(input.preferred_supplier_mentioned),
    incumbent_supplier: readString(input.incumbent_supplier),
    contract_type_requested: normalizeChoice(
      readContractType(input.contract_type_requested),
      choices.contract_type_options,
    ),
    delivery_countries: readStringArray(input.delivery_countries)
      .map((value) => normalizeChoice(value, choices.country_options))
      .filter(Boolean),
    esg_requirement: readBoolean(input.esg_requirement),
  };
}

function parseModelJson(raw: string | null | undefined): unknown {
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY in environment variables." },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json()) as { prompt?: unknown };
    const prompt = readString(body.prompt);

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
    }
    const choiceOptions = await getChoiceOptions();
    const allowedOptionsPayload = JSON.stringify(choiceOptions);

    const firstPass = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: EXTRACTION_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content:
            "ALLOWED_OPTIONS JSON:\n" +
            allowedOptionsPayload +
            "\n\nOriginal request:\n" +
            prompt,
        },
      ],
    });

    const firstPassRaw = firstPass.choices[0]?.message?.content;
    const firstPassParsed = parseModelJson(firstPassRaw);

    const reviewPass = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: REVIEW_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content:
            "Original request:\n" +
            prompt +
            "\n\nALLOWED_OPTIONS JSON:\n" +
            allowedOptionsPayload +
            "\n\nFirst-pass extraction JSON:\n" +
            JSON.stringify(firstPassParsed),
        },
      ],
    });

    const reviewedRaw = reviewPass.choices[0]?.message?.content;
    const reviewedParsed = parseModelJson(reviewedRaw);

    const session = await getSession();
    const sessionRole = session.roleLabel ?? session.role ?? "";

    const data = normalizeParsedRequest(reviewedParsed, choiceOptions);
    const merged = {
      ...DEFAULTS,
      ...data,
      request_text: data.request_text || prompt,
      requester_role: data.requester_role || sessionRole,
      preferred_supplier_mentioned: data.preferred_supplier_mentioned || "None",
      incumbent_supplier: data.incumbent_supplier || "None",
    };

    return NextResponse.json({ data: merged });
  } catch (error) {
    console.error("Failed to parse client request", error);
    return NextResponse.json(
      { error: "Failed to parse request using OpenAI." },
      { status: 500 },
    );
  }
}
