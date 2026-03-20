import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const { requestData } = await req.json();

  const ri = requestData?.request_interpretation ?? {};
  const suppliers = requestData?.supplier_shortlist ?? [];
  const recommendation = requestData?.recommendation ?? {};
  const approvalTier = requestData?.approval_tier;

  const allEscalations = Object.values(requestData?.stages ?? {}).flatMap(
    (s: any) => s.escalations ?? [],
  );
  const allIssues = Object.values(requestData?.stages ?? {}).flatMap(
    (s: any) => s.issues ?? [],
  );

  const prompt = `You are a senior procurement analyst writing a concise executive summary for a procurement manager. Based on the pipeline result below, write 4–6 sentences covering:
1. What was requested, by whom, and from which business unit
2. The recommended supplier and the key reasons for selection (price, quality, compliance)
3. Any significant escalations, issues, or policy violations that were raised
4. The approval tier required and number of quotes needed
5. The overall procurement status and any next steps

Be specific: use actual supplier names, monetary values, and policy rule IDs where available. Be direct and professional.

Request: ${ri.title ?? "Unknown"} (${ri.category_l1 ?? ""} / ${ri.category_l2 ?? ""})
Business unit: ${ri.business_unit ?? "N/A"}, ${ri.country ?? "N/A"}
Budget: ${ri.currency ?? ""} ${ri.budget_amount ?? "N/A"}, Quantity: ${ri.quantity ?? "N/A"} ${ri.unit_of_measure ?? ""}
Required by: ${ri.required_by_date ?? "N/A"}

Top suppliers: ${suppliers.slice(0, 3).map((s: any) => `#${s.rank} ${s.supplier_name} (${s.currency} ${s.total_price?.toLocaleString()}, quality ${s.quality_score}, risk ${s.risk_score})`).join("; ") || "None"}

Recommendation: ${recommendation.status ?? "N/A"} — ${recommendation.reason ?? ""}${recommendation.preferred_supplier_if_resolved ? ` | Preferred: ${recommendation.preferred_supplier_if_resolved}` : ""}

Approval tier: ${approvalTier ? `Tier ${approvalTier.tier_number}, ${approvalTier.min_supplier_quotes} quote(s) required, approvers: ${approvalTier.approvers?.join(", ")}` : "N/A"}

Escalations (${allEscalations.length}): ${allEscalations.map((e: any) => e.rule).join(", ") || "None"}
Issues (${allIssues.length}): ${allIssues.map((i: any) => i.trigger).slice(0, 3).join("; ") || "None"}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 500,
  });

  return NextResponse.json({
    summary: response.choices[0].message.content,
  });
}
