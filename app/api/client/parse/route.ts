import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  DEFAULTS,
  EXTRACTION_KEYS,
  EXTRACTION_SYSTEM_PROMPT,
  getChoiceOptions,
  normalizeParsedRequest,
  parseModelJson,
  readString,
} from "@/lib/parse-utils";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const REVIEW_SYSTEM_PROMPT =
  "You are reviewing a first-pass procurement extraction for semantic correctness. " +
  `Return exactly one corrected JSON object with keys: ${EXTRACTION_KEYS}. ` +
  "Preserve values that are already correct, but fix field-role mistakes. " +
  "Ensure consistent English normalization for all textual fields except request_language, which must be a lowercase ISO 639-1 code for the input language (for example: en, fr, de). " +
  "contract_type_requested must be either 'purchase' or 'sell'. If unknown, return empty string. " +
  "Critically verify supplier roles: preferred_supplier_mentioned must represent the requested supplier in this request, while incumbent_supplier must represent an existing current supplier only if explicitly supported by text. " +
  "Use empty string / 0 / [] / false for unknowns. " +
  "For choice fields, use only values from ALLOWED_OPTIONS provided by the user.";

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
