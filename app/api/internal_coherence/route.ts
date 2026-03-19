import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

const client = new OpenAI();

const PROMPT = `You are an internal coherence checker in a procurement pipeline.

You will receive a procurement request JSON. Your job is to identify logical contradictions or implausible combinations within the request itself — not against external policy, but internally. Focus on things like:
- Budget amount that is clearly too low or too high relative to the described goods/services and quantity. If you are unsure raise an issue instead of an escalation.
- Quantity that does not match what is described in free-text fields
- Delivery dates that are contradictory or nonsensical relative to the request date or quantity
- Mismatches between the stated category and the described items
- Any other internal inconsistency that a procurement officer would immediately flag

If a mismatch is found, raise a formal escalation under rule "ER-001" (Internal Coherence Failure).
If everything looks internally consistent, return empty arrays.

Return a JSON object with exactly these fields:
{
  "escalations": [
    {
      "escalation_id": "ESC-XXX",
      "rule": "ER-001",
      "trigger": "<what specific fields are inconsistent and why>",
      "escalate_to": "Requester",
      "blocking": true
    }
  ],
  "reasonings": [
    {
      "step_id": "R-XXX",
      "aspect": "<the aspect checked, e.g. 'Budget vs Quantity', 'Category vs Description'>",
      "reasoning": "<your analysis of whether this aspect is coherent>"
    }
  ],
  "issues": [
    {
      "issue_id": "ISS-XXX",
      "trigger": "<the specific field or value that raised this issue>",
      "escalate_to": "<who should resolve it, e.g. 'Requester'>",
      "blocking": false
    }
  ],
  "policy_violations": []
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
  const escalations = result?.escalations ?? [];
  if (escalations.length === 0) {
    console.log("[internal_coherence] no coherence issues found");
  } else {
    console.log(`[internal_coherence] ${escalations.length} escalation(s):`, escalations.map((e: { trigger: string }) => e.trigger));
  }
  return NextResponse.json(result);
}
