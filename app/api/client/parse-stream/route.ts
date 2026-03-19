import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  DEFAULTS,
  EXTRACTION_SYSTEM_PROMPT,
  getChoiceOptions,
  normalizeParsedRequest,
  parseModelJson,
  readString,
} from "@/lib/parse-utils";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY in environment variables." },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json()) as { transcript?: unknown };
    const transcript = readString(body.transcript);

    if (!transcript) {
      return NextResponse.json(
        { error: "Transcript is required." },
        { status: 400 },
      );
    }

    const choiceOptions = await getChoiceOptions();
    const allowedOptionsPayload = JSON.stringify(choiceOptions);

    const result = await openai.chat.completions.create({
      model: "gpt-4o-mini",
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
            transcript,
        },
      ],
    });

    const raw = result.choices[0]?.message?.content;
    const parsed = parseModelJson(raw);

    const session = await getSession();
    const sessionRole = session.roleLabel ?? session.role ?? "";

    const data = normalizeParsedRequest(parsed, choiceOptions);
    const merged = {
      ...DEFAULTS,
      ...data,
      request_text: data.request_text || transcript,
      requester_role: data.requester_role || sessionRole,
      preferred_supplier_mentioned: data.preferred_supplier_mentioned || "None",
      incumbent_supplier: data.incumbent_supplier || "None",
    };

    return NextResponse.json({ data: merged });
  } catch (error) {
    console.error("Failed to parse transcript", error);
    return NextResponse.json(
      { error: "Failed to parse transcript." },
      { status: 500 },
    );
  }
}
