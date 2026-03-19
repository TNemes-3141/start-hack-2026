import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

const client = new OpenAI();

const PROMPT = `You are a procurement policy analysis agent. Your job is to carefully review a procurement request and return a structured analysis.

Return a JSON object with exactly these four top-level fields:

"issues": An array of concrete problems identified in the request. Each entry must have:
  - "issue_id": string — unique identifier, e.g. "ISS-001"
  - "trigger": string — the specific condition or field value that caused this issue
  - "escalate_to": string — who needs to act to resolve it (e.g. "Requester", "Procurement Manager", "Head of Category")
  - "blocking": boolean — true if this issue prevents the request from proceeding

"escalations": An array of formal escalation actions required by policy. Each entry must have:
  - "escalation_id": string — unique identifier, e.g. "ESC-001"
  - "rule": string — the policy rule being triggered, e.g. "AT-002"
  - "trigger": string — what caused this escalation
  - "escalate_to": string — the role or person to escalate to
  - "blocking": boolean — true if the request cannot proceed until resolved

"reasonings": An array of reasoning steps documenting how you reached your conclusions. Each entry must have:
  - "step_id": string — sequential identifier, e.g. "R-001"
  - "aspect": string — the dimension being evaluated, e.g. "Budget Sufficiency", "Lead Time", "Policy Compliance"
  - "reasoning": string — a clear, concise explanation of your analysis for this aspect

"policy_violations": An array of policy rules that are violated by this request. Each entry must have:
  - "policy": string — the policy identifier or name, e.g. "AT-002", "Single-Source Rule"
  - "description": string — a brief explanation of why this policy is violated

Return only valid JSON matching this structure exactly. Do not include any explanation, markdown, or text outside the JSON object.`;

// Sample input shape — replace with real schema as the system evolves
const SAMPLE_INPUT = {
  request_id: "REQ-000001",
  category: "IT / Laptops",
  quantity: 10,
  budget_amount: 5000,
  currency: "EUR",
  delivery_country: "DE",
  preferred_supplier: "Dell",
  requester_instruction: "single supplier only",
};

type AnalyzeInput = typeof SAMPLE_INPUT;

export async function POST(req: NextRequest) {
  const body: AnalyzeInput = await req.json();

  console.log("RUN GENERIC API NODE")

  const completion = await client.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: PROMPT },
      { role: "user", content: JSON.stringify(body) },
    ],
  });

  console.log("END GENERIC API NODE")

  const result = JSON.parse(completion.choices[0].message.content ?? "{}");
  return NextResponse.json(result);
}
