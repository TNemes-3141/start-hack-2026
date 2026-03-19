import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

const client = new OpenAI();

const PROMPT = `You are a translation agent in a procurement pipeline.

You will receive a procurement request JSON. Your job is to:
1. Detect the language of any free-text fields (e.g. request descriptions, comments, instructions, titles).
2. If the text is already in English, return it as-is.
3. If the text is in any other language, produce a clean English translation of all free-text content, preserving meaning and procurement terminology.

Return a JSON object with exactly this structure:
{
  "request_interpretation": {
    "request_text": "<English version of the full request's free-text content, or original if already English>"
  }
}

Do not include any explanation, markdown, or fields outside this structure.`;

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
  console.log("[translate] output request_text:", result?.request_interpretation?.request_text?.slice(0, 200));
  return NextResponse.json(result);
}
