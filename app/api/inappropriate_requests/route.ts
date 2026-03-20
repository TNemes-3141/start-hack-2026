import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import type { Issue, Reasoning, NodeResult } from "@/lib/request-data";
import { getPricingForCategory } from "@/lib/db";

const client = new OpenAI();

// Country → pricing region mapping
const COUNTRY_TO_REGION: Record<string, string> = {
  DE: "EU", FR: "EU", NL: "EU", BE: "EU", AT: "EU",
  IT: "EU", ES: "EU", PL: "EU", UK: "EU", CH: "CH",
  US: "Americas", CA: "Americas", BR: "Americas", MX: "Americas",
  SG: "APAC", AU: "APAC", IN: "APAC", JP: "APAC",
  UAE: "MEA", ZA: "MEA",
};

const LLM_FALLBACK_PROMPT = `You are a procurement validation agent. A purchase request has been submitted but there is insufficient pricing data in the database to run a statistical analysis.

Evaluate the following two questions:
1. Is the expected unit price obviously too low for this type of product or service? Only flag if the price is clearly unreasonable — i.e. implausibly cheap for the market. Do NOT flag ambiguous cases.
2. Is the required delivery timeline obviously too short-notice for this type of product or service? Only flag if the deadline is clearly unachievable in practice. Do NOT flag ambiguous cases.

Return a JSON object with exactly these fields:
{
  "price_flag": boolean,
  "price_reason": string,
  "lead_time_flag": boolean,
  "lead_time_reason": string
}

Return only valid JSON. No markdown, no explanation outside the JSON object.`;

export async function POST(req: NextRequest) {
  const body = await req.json() as Record<string, unknown>;

  const category_l1 = (body["category_l1"] ?? "") as string;
  const category_l2 = (body["category_l2"] ?? "") as string;
  const currency = (body["currency"] ?? "") as string;
  const budget_amount = typeof body["budget_amount"] === "number" ? body["budget_amount"] : null;
  const quantity = typeof body["quantity"] === "number" ? body["quantity"] : null;
  const required_by_date = (body["required_by_date"] ?? "") as string;
  const delivery_countries = Array.isArray(body["delivery_countries"]) ? body["delivery_countries"] as string[] : [];

  console.log(`[inappropriate_requests] cat=(${category_l1}/${category_l2}) qty=${quantity} budget=${budget_amount} ${currency} due=${required_by_date}`);

  const issues: Issue[] = [];
  const reasonings: Reasoning[] = [];
  let issueIdx = 1;
  let stepIdx = 1;

  const today = new Date().toISOString().split("T")[0];

  const expected_unit_price =
    budget_amount !== null && quantity !== null && quantity > 0
      ? budget_amount / quantity
      : null;

  const days_available = required_by_date
    ? Math.floor((new Date(required_by_date).getTime() - new Date(today).getTime()) / 86400000)
    : null;

  const regions = [...new Set(
    delivery_countries.map((c) => COUNTRY_TO_REGION[c as string]).filter(Boolean)
  )];

  // --- Query pricing table ---
  let pricingRows: Awaited<ReturnType<typeof getPricingForCategory>> = [];
  let dbError = false;
  try {
    if (category_l1 && category_l2 && currency && regions.length > 0 && quantity !== null) {
      pricingRows = await getPricingForCategory(category_l1, category_l2, currency, regions, quantity, today);
    }
  } catch (e) {
    console.error("[inappropriate_requests] DB query failed:", e);
    dbError = true;
  }

  console.log(`[inappropriate_requests] ${pricingRows.length} pricing row(s) found`);

  const allUnitPrices: number[] = pricingRows.flatMap((r) =>
    [r.unit_price, r.expedited_unit_price].filter((p): p is number => p !== null && p > 0)
  );
  const leadTimes: number[] = pricingRows
    .map((r) => r.standard_lead_time_days)
    .filter((d): d is number => d !== null);

  const hasData = !dbError && pricingRows.length > 0;

  if (hasData) {
    // ── Price check ─────────────────────────────────────────────────────────────
    if (expected_unit_price !== null && allUnitPrices.length > 0) {
      const minPrice = Math.min(...allUnitPrices);
      const maxPrice = Math.max(...allUnitPrices);
      // Flag only if expected is below 60% of the cheapest observed price — clearly outside range
      const priceFlag = expected_unit_price < minPrice * 0.6;

      reasonings.push({
        step_id: `R-IR-${String(stepIdx++).padStart(3, "0")}`,
        aspect: "Budget vs. Market Price",
        reasoning: `Expected unit price: ${currency} ${expected_unit_price.toFixed(2)} (${budget_amount} ÷ ${quantity}). ` +
          `Market prices for ${category_l1} / ${category_l2} in region(s) ${regions.join(", ")}, qty tier ${quantity}: ` +
          `min=${minPrice.toFixed(2)}, max=${maxPrice.toFixed(2)} across ${allUnitPrices.length} data point(s). ` +
          (priceFlag
            ? `Expected price is below 60% of the cheapest market price (threshold: ${(minPrice * 0.6).toFixed(2)}) — flagged as likely too low.`
            : `Expected price is within an acceptable range relative to market data.`),
      });

      if (priceFlag) {
        issues.push({
          issue_id: `ISS-IR-${String(issueIdx++).padStart(3, "0")}`,
          trigger: `Expected unit price (${currency} ${expected_unit_price.toFixed(2)}) is below 60% of minimum market price (${currency} ${minPrice.toFixed(2)}) for ${category_l1} / ${category_l2}`,
          escalate_to: "Requester",
          blocking: false,
          severity: "low",
        });
      }
    }

    // ── Lead time check ──────────────────────────────────────────────────────────
    if (days_available !== null) {
      if (days_available < 4) {
        reasonings.push({
          step_id: `R-IR-${String(stepIdx++).padStart(3, "0")}`,
          aspect: "Delivery Lead Time",
          reasoning: `Required by ${required_by_date} is only ${days_available} day(s) from today (${today}). ` +
            `This is below the hard minimum of 4 days regardless of supplier capability. Flagged as critically short notice.`,
        });
        issues.push({
          issue_id: `ISS-IR-${String(issueIdx++).padStart(3, "0")}`,
          trigger: `Required delivery in ${days_available} day(s), below the minimum 4-day threshold. Likely critically short notice.`,
          escalate_to: "Requester",
          blocking: false,
          severity: "critical",
        });
      } else if (leadTimes.length > 0) {
        const minLeadTime = Math.min(...leadTimes);
        const leadTimeFlag = days_available < minLeadTime;

        reasonings.push({
          step_id: `R-IR-${String(stepIdx++).padStart(3, "0")}`,
          aspect: "Delivery Lead Time",
          reasoning: `Required by ${required_by_date} gives ${days_available} day(s) from today (${today}). ` +
            `Minimum standard lead time across ${leadTimes.length} matching supplier row(s): ${minLeadTime} day(s). ` +
            (leadTimeFlag
              ? `Deadline is shorter than the minimum supplier lead time — flagged as unrealistically short notice. Requester should confirm if this is a hard constraint.`
              : `Deadline is achievable within at least one supplier's standard lead time.`),
        });

        if (leadTimeFlag) {
          issues.push({
            issue_id: `ISS-IR-${String(issueIdx++).padStart(3, "0")}`,
            trigger: `Required delivery in ${days_available} day(s) but minimum supplier standard lead time is ${minLeadTime} day(s) for ${category_l1} / ${category_l2}`,
            escalate_to: "Requester",
            blocking: false,
            severity: "high",
          });
        }
      }
    }
  } else {
    // ── LLM fallback (no DB data) ────────────────────────────────────────────────
    console.log("[inappropriate_requests] no pricing data — using LLM fallback");

    const llmInput = {
      category_l1,
      category_l2,
      currency,
      budget_amount,
      quantity,
      expected_unit_price,
      required_by_date,
      days_until_required: days_available,
      today,
      note: dbError
        ? "Pricing DB query failed — use general procurement knowledge."
        : "No pricing rows matched these filters — use general procurement knowledge.",
    };

    try {
      const completion = await client.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: LLM_FALLBACK_PROMPT },
          { role: "user", content: JSON.stringify(llmInput) },
        ],
      });

      const llm = JSON.parse(completion.choices[0].message.content ?? "{}") as {
        price_flag: boolean;
        price_reason: string;
        lead_time_flag: boolean;
        lead_time_reason: string;
      };

      reasonings.push({
        step_id: `R-IR-${String(stepIdx++).padStart(3, "0")}`,
        aspect: "Budget vs. Market Price (LLM fallback)",
        reasoning: `No pricing data available for statistical analysis. LLM assessment: ${llm.price_reason}`,
      });
      if (llm.price_flag && expected_unit_price !== null) {
        issues.push({
          issue_id: `ISS-IR-${String(issueIdx++).padStart(3, "0")}`,
          trigger: `LLM flagged expected unit price (${currency} ${expected_unit_price.toFixed(2)}) as likely too low for ${category_l1} / ${category_l2}`,
          escalate_to: "Requester",
          blocking: false,
          severity: "low",
        });
      }

      reasonings.push({
        step_id: `R-IR-${String(stepIdx++).padStart(3, "0")}`,
        aspect: "Delivery Lead Time (LLM fallback)",
        reasoning: `No lead time data available for statistical analysis. LLM assessment: ${llm.lead_time_reason}`,
      });
      if (llm.lead_time_flag) {
        issues.push({
          issue_id: `ISS-IR-${String(issueIdx++).padStart(3, "0")}`,
          trigger: `LLM flagged required delivery timeline (${days_available} day(s)) as likely too short for ${category_l1} / ${category_l2}`,
          escalate_to: "Requester",
          blocking: false,
          severity: "high",
        });
      }
    } catch (e) {
      console.error("[inappropriate_requests] LLM fallback error:", e);
      reasonings.push({
        step_id: `R-IR-${String(stepIdx++).padStart(3, "0")}`,
        aspect: "Validation Fallback",
        reasoning: "Both the pricing DB query and the LLM fallback failed. Price and lead time appropriateness could not be assessed for this request.",
      });
    }
  }

  console.log(
    issues.length === 0
      ? "[inappropriate_requests] no issues flagged"
      : `[inappropriate_requests] ${issues.length} issue(s): ${issues.map((i) => i.issue_id).join(", ")}`
  );

  const result: NodeResult = { issues, reasonings, escalations: [], policy_violations: [] };
  return NextResponse.json(result);
}
