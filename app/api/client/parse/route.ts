import OpenAI from "openai";
import { NextResponse } from "next/server";

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
  "delivery_countries must be an array of ISO 3166-1 alpha-2 country codes (for example ['DE']). " +
  "Semantic definitions: preferred_supplier_mentioned is a supplier explicitly requested/desired in this specific request; incumbent_supplier is the currently active supplier relationship before this request. " +
  "If there is no explicit evidence of an incumbent supplier, keep incumbent_supplier empty. " +
  "Do not rely on keyword heuristics; infer based on role and context in the sentence.";

const REVIEW_SYSTEM_PROMPT =
  "You are reviewing a first-pass procurement extraction for semantic correctness. " +
  `Return exactly one corrected JSON object with keys: ${EXTRACTION_KEYS}. ` +
  "Preserve values that are already correct, but fix field-role mistakes. " +
  "Ensure consistent English normalization for all textual fields except request_language, which must be a lowercase ISO 639-1 code for the input language (for example: en, fr, de). " +
  "contract_type_requested must be either 'purchase' or 'sell'. If unknown, return empty string. " +
  "Critically verify supplier roles: preferred_supplier_mentioned must represent the requested supplier in this request, while incumbent_supplier must represent an existing current supplier only if explicitly supported by text. " +
  "Use empty string / 0 / [] / false for unknowns.";

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

function normalizeParsedRequest(payload: unknown): ParsedClientRequest {
  const input =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};

  return {
    request_language: readString(input.request_language),
    business_unit: readString(input.business_unit),
    country: readString(input.country),
    city: readString(input.city),
    requester_id: readString(input.requester_id),
    requester_role: readString(input.requester_role),
    category_l1: readString(input.category_l1),
    category_l2: readString(input.category_l2),
    title: readString(input.title),
    request_text: readString(input.request_text),
    currency: readString(input.currency),
    budget_amount: readNumber(input.budget_amount),
    quantity: readNumber(input.quantity),
    unit_of_measure: readString(input.unit_of_measure),
    required_by_date: readString(input.required_by_date),
    preferred_supplier_mentioned: readString(input.preferred_supplier_mentioned),
    incumbent_supplier: readString(input.incumbent_supplier),
    contract_type_requested: readContractType(input.contract_type_requested),
    delivery_countries: readStringArray(input.delivery_countries),
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
          content: prompt,
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
            "\n\nFirst-pass extraction JSON:\n" +
            JSON.stringify(firstPassParsed),
        },
      ],
    });

    const reviewedRaw = reviewPass.choices[0]?.message?.content;
    const reviewedParsed = parseModelJson(reviewedRaw);

    const data = normalizeParsedRequest(reviewedParsed);
    const merged = {
      ...DEFAULTS,
      ...data,
      request_text: data.request_text || prompt,
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
