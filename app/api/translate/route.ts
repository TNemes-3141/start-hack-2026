import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PROMPT = `You are a language detection and translation agent in a procurement pipeline.

You will receive a procurement request JSON containing "request_text" and "title" fields.

Your task has TWO possible outcomes:

OUTCOME A — If BOTH "request_text" AND "title" are already in English:
Return exactly: { "already_english": true }
Do NOT include "request_text" or "title" fields. Do NOT rewrite, rephrase, summarise, or alter the original text in any way.

OUTCOME B — If EITHER "request_text" OR "title" is in a non-English language:
Return exactly:
{
  "already_english": false,
  "request_text": "<full English translation of request_text>",
  "title": "<full English translation of title>"
}
Translate ALL free-text content into English, preserving meaning and procurement terminology.

CRITICAL RULES:
- "already_english" is MANDATORY in every response.
- If already_english is true, you MUST NOT include "request_text" or "title" in your response.
- If already_english is false, you MUST include both "request_text" and "title" with full translations.
- Do not include any explanation, markdown, or fields outside this structure.`;

export async function POST(req: NextRequest) {
  const body: unknown = await req.json();
  const text = typeof body === "string" ? body : JSON.stringify(body);
  console.log("[translate] input text:", text.slice(0, 200));

  const completion = await client.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: PROMPT },
      { role: "user", content: text },
    ],
  });

  const result = JSON.parse(completion.choices[0].message.content ?? "{}");
  const alreadyEnglish = result.already_english === true;

  console.log("[translate] already_english:", alreadyEnglish);

  // If already English, don't touch request_interpretation at all — the originals stay intact.
  if (alreadyEnglish) {
    console.log("[translate] skipping — text is already English");
    return NextResponse.json({
      issues: [],
      escalations: [],
      reasonings: [],
      policy_violations: [],
    });
  }

  // Not English — use the LLM's translations.
  const { request_text, title } = result;
  console.log("[translate] translated request_text:", request_text?.slice(0, 200));
  console.log("[translate] translated title:", title);
  return NextResponse.json({
    request_interpretation: { request_text, title },
    issues: [],
    escalations: [],
    reasonings: [],
    policy_violations: [],
  });
}
