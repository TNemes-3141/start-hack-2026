import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PROMPT = `You are an internal coherence checker in a procurement pipeline.

You will receive a procurement request JSON. Your sole task is to check whether the values of specific structured fields are consistent with the free-text "request_text" field. You must NOT evaluate policy, budget reasonableness, or anything else.

For each of the following fields, produce exactly one reasoning entry:
  category_l1, category_l2, currency, budget_amount, quantity, unit_of_measure, required_by_date, preferred_supplier_mentioned

For each field, determine one of three statuses:
  - "succeeded"    — the field value is consistent with what request_text says (or does not contradict it)
  - "not_present"  — request_text does not mention anything that allows you to verify this field
  - "failed"       — there is clear, direct contradiction between the field value and request_text

Only mark "failed" when there is explicit, unambiguous evidence of contradiction in request_text. When in doubt, use "succeeded" or "not_present".

Return a JSON object with exactly these fields:
{
  "reasonings": [
    {
      "step_id": "R-001",
      "aspect": "<field_name> [<status>]",
      "reasoning": "<one sentence explaining why you assigned this status>"
    }
  ],
  "issues": [],
  "escalations": [],
  "policy_violations": []
}

If at least one field has status "failed", add a single blocking issue to the "issues" array:
{
  "issue_id": "ISS-001",
  "trigger": "<comma-separated list of failed field names>",
  "escalate_to": "Procurement",
  "blocking": true
}

Return only valid JSON. No explanation or text outside the JSON object.`;

export async function POST(req: NextRequest) {
  const body: unknown = await req.json();
  console.log("[internal_coherence] checking interpretation:", JSON.stringify(body).slice(0, 300));

  const completion = await client.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: PROMPT },
      { role: "user", content: JSON.stringify(body) },
    ],
  });

  const result = JSON.parse(completion.choices[0].message.content ?? "{}");
  const issues: { issue_id: string; trigger: string; blocking: boolean }[] = result?.issues ?? [];
  const reasonings: { aspect: string }[] = result?.reasonings ?? [];
  const failed = reasonings.filter((r) => r.aspect?.includes("[failed]"));
  console.log(`[internal_coherence] ${reasonings.length} field(s) checked, ${failed.length} failed`);
  if (issues.length > 0) {
    console.log(`[internal_coherence] blocking issue raised:`, issues.map((i) => i.trigger));
  }
  return NextResponse.json(result);
}
