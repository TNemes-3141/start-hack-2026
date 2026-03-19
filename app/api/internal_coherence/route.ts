import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PROMPT = `You are a strict internal coherence checker in a procurement pipeline.

Your ONLY job is to check whether specific structured fields contradict the free-text "request_text". You must NOT evaluate policy, feasibility, budget reasonableness, supplier suitability, or anything outside the scope below.

---

FIELDS TO CHECK (produce exactly one entry per field, in this order):
  category_l1, category_l2, currency, budget_amount, quantity, unit_of_measure, required_by_date, preferred_supplier_mentioned

---

STATUS RULES — read these carefully:

"succeeded"
  → The field value matches or is consistent with what request_text explicitly states.
  → Also use this when request_text mentions the topic but does not contradict the field value.

"not_present"
  → request_text contains NO information about this field.
  → The field value may be plausible, implausible, high, or low — it does not matter.
     If request_text is silent on the topic, the answer is ALWAYS "not_present", never "failed".

"failed"
  → request_text contains an EXPLICIT value or statement that DIRECTLY contradicts the field value.
  → Example of a valid "failed": budget_amount = 50000 but request_text says "my budget is 30,000 EUR".
  → Example of an INVALID "failed": budget_amount = 1200 and request_text mentions high-end equipment
     but gives no explicit budget figure — this is "not_present", NOT "failed".
  → Example of an INVALID "failed": quantity = 5 and request_text never mentions a number
     — this is "not_present", NOT "failed".

CRITICAL: "failed" requires a direct quote or paraphrase from request_text that contradicts the field.
If you cannot point to explicit text that states a conflicting value, do NOT use "failed".

---

OUTPUT FORMAT — return ONLY this JSON, nothing else:
{
  "reasonings": [
    {
      "aspect": "<field_name> [<status>]",
      "reasoning": "<one sentence: either quote the contradicting text, or explain why the field is not mentioned>"
    }
  ]
}`;

interface Reasoning {
  step_id: string;
  aspect: string;
  reasoning: string;
}

export async function POST(req: NextRequest) {
  const body: unknown = await req.json();
  console.log("[internal_coherence] checking interpretation:", JSON.stringify(body).slice(0, 300));

  const today = new Date().toISOString().slice(0, 10);
  const completion = await client.responses.create({
    model: "gpt-5-mini",
    reasoning: { effort: "low" },
    input: `${PROMPT}\n\nToday's date is ${today}. Use this to resolve relative date expressions in request_text (e.g. "end of next week", "in two weeks", "by Friday") to a concrete date before comparing against required_by_date.\n\nProcurement request:\n${JSON.stringify(body)}`,
  });

  const raw = JSON.parse(completion.output_text ?? "{}");
  const rawReasonings: Omit<Reasoning, "step_id">[] = raw?.reasonings ?? [];

  // Assign sequential step_ids regardless of what the model returned
  const reasonings: Reasoning[] = rawReasonings.map((r, i) => ({
    step_id: `R-${String(i + 1).padStart(3, "0")}`,
    aspect: r.aspect,
    reasoning: r.reasoning,
  }));

  // Derive failed fields from aspect strings
  const failedFields = reasonings
    .filter((r) => r.aspect?.includes("[failed]"))
    .map((r) => r.aspect.replace(/\s*\[.*$/, "").trim());

  // Statically generate the issue object if any field failed
  const issues =
    failedFields.length > 0
      ? [
          {
            issue_id: "ISS-001",
            trigger: failedFields.join(", "),
            description: `Contradiction detected between request_text and structured field(s): ${failedFields.join(", ")}`,
            escalate_to: "Procurement",
            blocking: true,
            severity: "high",
          },
        ]
      : [];

  console.log(`[internal_coherence] ${reasonings.length} field(s) checked, ${failedFields.length} failed`);
  if (issues.length > 0) {
    console.log(`[internal_coherence] blocking issue raised:`, failedFields);
  }

  return NextResponse.json({
    reasonings,
    issues,
    escalations: [],
    policy_violations: [],
  });
}
