import { NextRequest, NextResponse } from "next/server";
import type { Escalation, Issue, NodeResult, PolicyEvaluation, Reasoning, RequestData, ShortlistEntry } from "@/lib/request-data";
import { getPricingForSuppliers, type PricingRow } from "@/lib/db";

// ── Region mapping ────────────────────────────────────────────────────────────

const COUNTRY_REGION: Record<string, string> = {
  DE: "EU", FR: "EU", NL: "EU", BE: "EU", AT: "EU",
  IT: "EU", ES: "EU", PL: "EU", UK: "EU", CH: "EU",
  US: "Americas", CA: "Americas", BR: "Americas", MX: "Americas",
  SG: "APAC", AU: "APAC", IN: "APAC", JP: "APAC",
  UAE: "MEA", ZA: "MEA",
};

function primaryRegion(deliveryCountries: string[]): string {
  for (const c of deliveryCountries) {
    if (COUNTRY_REGION[c]) return COUNTRY_REGION[c];
  }
  return "EU";
}

// ── Name match helper ─────────────────────────────────────────────────────────

function nameMatches(supplierName: string, raw: string): boolean {
  if (!raw.trim()) return false;
  const sn = supplierName.toLowerCase();
  const pn = raw.toLowerCase().trim();
  if (sn.includes(pn) || pn.includes(sn)) return true;
  return sn.split(/\s+/).filter((w) => w.length > 3).some((w) => pn.includes(w));
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const data = await req.json() as RequestData;
  const interp = data.request_interpretation;

  const category_l1        = (interp.category_l1 ?? "").trim();
  const category_l2        = (interp.category_l2 ?? "").trim();
  const currency           = (interp.currency ?? "EUR").toUpperCase();
  const quantity           = interp.quantity ?? 0;
  const budget_amount      = interp.budget_amount ?? 0;
  const required_by_date   = interp.required_by_date ?? null;
  const delivery_countries = interp.delivery_countries ?? [];
  const preferred_raw      = interp.preferred_supplier_mentioned ?? "";
  const incumbent_raw      = interp.incumbent_supplier ?? "";

  const region = primaryRegion(delivery_countries);

  // Days until deadline
  let daysUntilRequired: number | null = null;
  if (required_by_date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadline = new Date(required_by_date);
    daysUntilRequired = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  const eligible = data.eligible_suppliers;

  const issues:            Issue[]            = [];
  const escalations:       Escalation[]       = [];
  const reasonings:        Reasoning[]        = [];
  const policy_violations: PolicyEvaluation[] = [];
  const shortlist:         ShortlistEntry[]   = [];

  let step = 1;
  let esc  = 1;
  let iss  = 1;

  console.log(`[pricing_calculation] ${eligible.length} eligible supplier(s), qty=${quantity}, region=${region}, currency=${currency}`);

  if (eligible.length === 0) {
    reasonings.push({
      step_id:   `R-PC-${String(step++).padStart(3, "0")}`,
      aspect:    "Pricing Calculation — No Eligible Suppliers",
      reasoning: "No eligible suppliers remain after prior filters. Pricing calculation skipped.",
    });
    return NextResponse.json({ issues, escalations, reasonings, policy_violations, supplier_shortlist: shortlist });
  }

  // ── Batch pricing fetch for all eligible suppliers ────────────────────────
  const allRows: PricingRow[] = await getPricingForSuppliers(
    eligible.map((s) => s.supplier_id),
    category_l1,
    category_l2,
    currency,
    region,
  );

  // Group rows by supplier
  const bySupplier = new Map<string, PricingRow[]>();
  for (const row of allRows) {
    const arr = bySupplier.get(row.supplier_id) ?? [];
    arr.push(row);
    bySupplier.set(row.supplier_id, arr);
  }

  reasonings.push({
    step_id:   `R-PC-${String(step++).padStart(3, "0")}`,
    aspect:    "Pricing Lookup — Batch Fetch",
    reasoning: `Fetched ${allRows.length} pricing row(s) for ${eligible.length} supplier(s) in (${category_l1} / ${category_l2}), currency=${currency}, region=${region}.`,
  });

  // ── Per-supplier evaluation ───────────────────────────────────────────────
  for (const supplier of eligible) {
    const sid   = supplier.supplier_id;
    const sname = supplier.supplier_name ?? sid;

    // ── Capacity check ──────────────────────────────────────────────────────
    if (supplier.capacity_per_month !== null && quantity > supplier.capacity_per_month) {
      escalations.push({
        escalation_id: `ESC-PC-${String(esc++).padStart(3, "0")}`,
        rule:          "ER-006",
        trigger:       `${sname}: requested quantity ${quantity} exceeds monthly capacity of ${supplier.capacity_per_month}`,
        escalate_to:   "Sourcing Excellence Lead",
        blocking:      false,
      });
      reasonings.push({
        step_id:   `R-PC-${String(step++).padStart(3, "0")}`,
        aspect:    `${sid} — Capacity Check`,
        reasoning: `ER-006: ${sname} has a monthly capacity of ${supplier.capacity_per_month} units. Requested quantity is ${quantity} — exceeds capacity by ${quantity - supplier.capacity_per_month} units. Escalated to Sourcing Excellence Lead for negotiation. Supplier remains in evaluation.`,
      });
    }

    // ── Pricing lookup ──────────────────────────────────────────────────────
    const rows = bySupplier.get(sid) ?? [];

    if (rows.length === 0) {
      issues.push({
        issue_id:    `ISS-PC-${String(iss++).padStart(3, "0")}`,
        trigger:     `${sname}: no pricing data for (${category_l1} / ${category_l2}), currency=${currency}, region=${region}`,
        escalate_to: "Requester",
        blocking:    false,
        severity:    "high",
      });
      reasonings.push({
        step_id:   `R-PC-${String(step++).padStart(3, "0")}`,
        aspect:    `${sid} — No Pricing Data`,
        reasoning: `No pricing rows found for ${sname} in (${category_l1} / ${category_l2}), currency=${currency}, region=${region}. No quote can be gathered. Supplier excluded from shortlist.`,
      });
      continue;
    }

    // MOQ check (use first row — MOQ is consistent across tiers for a supplier)
    const moq = rows[0].moq ?? 0;
    if (moq > 0 && quantity < moq) {
      issues.push({
        issue_id:    `ISS-PC-${String(iss++).padStart(3, "0")}`,
        trigger:     `${sname}: quantity ${quantity} is below MOQ of ${moq}`,
        escalate_to: "Requester",
        blocking:    false,
        severity:    "high",
      });
      reasonings.push({
        step_id:   `R-PC-${String(step++).padStart(3, "0")}`,
        aspect:    `${sid} — MOQ Not Met`,
        reasoning: `${sname} requires a minimum order quantity of ${moq}. Requested quantity is ${quantity} — MOQ not met. No quote can be gathered from this supplier.`,
      });
      continue;
    }

    // Find matching pricing tier
    const matchingRow = rows.find(
      (r) =>
        (r.min_quantity === null || quantity >= r.min_quantity) &&
        (r.max_quantity === null || quantity <= r.max_quantity)
    );

    if (!matchingRow) {
      const allMins = rows.filter((r) => r.min_quantity !== null).map((r) => r.min_quantity!);
      const allMaxs = rows.filter((r) => r.max_quantity !== null).map((r) => r.max_quantity!);
      const minQ    = allMins.length ? Math.min(...allMins) : "?";
      const maxQ    = allMaxs.length ? Math.max(...allMaxs) : "?";
      issues.push({
        issue_id:    `ISS-PC-${String(iss++).padStart(3, "0")}`,
        trigger:     `${sname}: quantity ${quantity} falls outside all pricing tiers (available range: ${minQ}–${maxQ})`,
        escalate_to: "Requester",
        blocking:    false,
        severity:    "high",
      });
      reasonings.push({
        step_id:   `R-PC-${String(step++).padStart(3, "0")}`,
        aspect:    `${sid} — No Matching Pricing Tier`,
        reasoning: `${sname} pricing tiers cover quantities ${minQ}–${maxQ}. Requested quantity ${quantity} does not fall within any tier. No quote can be gathered.`,
      });
      continue;
    }

    const stdUnitPrice = matchingRow.unit_price      ?? 0;
    const expUnitPrice = matchingRow.expedited_unit_price ?? stdUnitPrice;
    const stdLeadTime  = matchingRow.standard_lead_time_days  ?? 0;
    const expLeadTime  = matchingRow.expedited_lead_time_days ?? 0;

    // ── Lead time check ─────────────────────────────────────────────────────
    let recommendationNote = "";

    if (daysUntilRequired !== null) {
      if (stdLeadTime > daysUntilRequired) {
        if (expLeadTime > 0 && expLeadTime <= daysUntilRequired) {
          // Expedited can meet deadline
          issues.push({
            issue_id:    `ISS-PC-${String(iss++).padStart(3, "0")}`,
            trigger:     `${sname}: standard lead time ${stdLeadTime}d exceeds ${daysUntilRequired}d available — expedited delivery required`,
            escalate_to: "Requester",
            blocking:    false,
            severity:    "low",
          });
          reasonings.push({
            step_id:   `R-PC-${String(step++).padStart(3, "0")}`,
            aspect:    `${sid} — Expedited Delivery Required`,
            reasoning: `${sname} standard lead time (${stdLeadTime}d) exceeds the ${daysUntilRequired} days remaining until ${required_by_date}. Expedited option (${expLeadTime}d) can meet the deadline at a premium price. Expedited pricing applied to this quote.`,
          });
          recommendationNote = `Expedited delivery required: standard ${stdLeadTime}d exceeds deadline, expedited ${expLeadTime}d meets it.`;
        } else {
          // Neither option meets deadline
          issues.push({
            issue_id:    `ISS-PC-${String(iss++).padStart(3, "0")}`,
            trigger:     `${sname}: standard (${stdLeadTime}d) and expedited (${expLeadTime}d) lead times both exceed ${daysUntilRequired}d until ${required_by_date}`,
            escalate_to: "Requester",
            blocking:    false,
            severity:    "high",
          });
          reasonings.push({
            step_id:   `R-PC-${String(step++).padStart(3, "0")}`,
            aspect:    `${sid} — Lead Time Cannot Meet Deadline`,
            reasoning: `${sname} standard lead time (${stdLeadTime}d) and expedited lead time (${expLeadTime > 0 ? `${expLeadTime}d` : "unavailable"}) both exceed the ${daysUntilRequired} days remaining until ${required_by_date}. Delivery by deadline is only possible through direct timeline negotiation.`,
          });
          recommendationNote = `Lead time risk: standard ${stdLeadTime}d, expedited ${expLeadTime > 0 ? `${expLeadTime}d` : "N/A"} — both exceed deadline (${daysUntilRequired}d remaining). Negotiation required.`;
        }
      } else {
        reasonings.push({
          step_id:   `R-PC-${String(step++).padStart(3, "0")}`,
          aspect:    `${sid} — Lead Time Check`,
          reasoning: `${sname} standard lead time (${stdLeadTime}d) meets the ${required_by_date} deadline (${daysUntilRequired}d remaining).`,
        });
      }
    }

    // ── Quote calculation ───────────────────────────────────────────────────
    const stdTotal = stdUnitPrice * quantity;
    const expTotal = expUnitPrice * quantity;

    if (budget_amount > 0 && stdTotal > budget_amount) {
      const overage    = stdTotal - budget_amount;
      const overagePct = ((overage / budget_amount) * 100).toFixed(1);
      issues.push({
        issue_id:    `ISS-PC-${String(iss++).padStart(3, "0")}`,
        trigger:     `${sname}: total quote ${stdTotal.toFixed(2)} ${currency} exceeds budget ${budget_amount} ${currency} by ${overage.toFixed(2)} ${currency} (${overagePct}%)`,
        escalate_to: "Requester",
        blocking:    false,
        severity:    "middle",
      });
      reasonings.push({
        step_id:   `R-PC-${String(step++).padStart(3, "0")}`,
        aspect:    `${sid} — Over Budget`,
        reasoning: `${sname}: ${quantity} × ${stdUnitPrice.toFixed(2)} ${currency} = ${stdTotal.toFixed(2)} ${currency}, which exceeds the stated budget of ${budget_amount} ${currency} by ${overage.toFixed(2)} ${currency} (${overagePct}%).`,
      });
      if (!recommendationNote) recommendationNote = `Over budget: ${stdTotal.toFixed(2)} ${currency} vs. budget ${budget_amount} ${currency} (+${overagePct}%).`;
    } else {
      reasonings.push({
        step_id:   `R-PC-${String(step++).padStart(3, "0")}`,
        aspect:    `${sid} — Quote`,
        reasoning: `${sname}: ${quantity} × ${stdUnitPrice.toFixed(2)} ${currency} = ${stdTotal.toFixed(2)} ${currency}${budget_amount > 0 ? ` — within budget of ${budget_amount} ${currency}` : ""}.`,
      });
    }

    // ── Build shortlist entry ───────────────────────────────────────────────
    shortlist.push({
      // All EligibleSupplier fields (spread first, then override/extend)
      ...supplier,
      supplier_name:            sname, // ensure non-null
      // Pricing
      rank:                     0,     // set in scoring_and_ranking
      pricing_tier_applied:     matchingRow.pricing_id,
      unit_price:               stdUnitPrice,
      total_price:              stdTotal,
      standard_lead_time_days:  stdLeadTime,
      expedited_lead_time_days: expLeadTime,
      expedited_unit_price:     expUnitPrice,
      expedited_total:          expTotal,
      // Request-context flags
      is_requester_preferred:   nameMatches(sname, preferred_raw),
      is_incumbent:             nameMatches(sname, incumbent_raw),
      policy_compliant:         true,
      covers_delivery_country:  true,
      recommendation_note:      recommendationNote,
      // Scoring — zero-initialised; filled by scoring_and_ranking
      ranking_score: 0,
      scoring_breakdown: {
        price_raw: 0, quality_raw: 0, risk_raw: 0, esg_raw: 0,
        base_score: 0, preferred_bonus: 0, incumbent_bonus: 0,
        data_residency_bonus: 0, lead_time_penalty: 0, final_score: 0,
        weights: { price: 0, quality: 0, risk: 0, esg: 0 },
        lead_time_status: "no_deadline" as const,
      },
    });
  }

  // ── ER-004 if no quotes at all ────────────────────────────────────────────
  if (shortlist.length === 0 && eligible.length > 0) {
    escalations.push({
      escalation_id: `ESC-PC-${String(esc++).padStart(3, "0")}`,
      rule:          "ER-004",
      trigger:       `No quotes could be gathered for any of ${eligible.length} eligible supplier(s) in (${category_l1} / ${category_l2})`,
      escalate_to:   "Head of Category",
      blocking:      true,
    });
    reasonings.push({
      step_id:   `R-PC-${String(step++).padStart(3, "0")}`,
      aspect:    "Pricing Summary — No Quotes Available",
      reasoning: `No quotes could be gathered from any of the ${eligible.length} eligible supplier(s). Possible causes: missing pricing data, MOQ violations, or quantity outside tier range. Pipeline blocked — escalated to Head of Category per ER-004.`,
    });
  } else {
    reasonings.push({
      step_id:   `R-PC-${String(step++).padStart(3, "0")}`,
      aspect:    "Pricing Summary",
      reasoning: `${shortlist.length} of ${eligible.length} eligible supplier(s) successfully quoted: ${shortlist.map((s) => `${s.supplier_name} (${s.total_price.toFixed(2)} ${currency} std)`).join(", ")}.`,
    });
  }

  console.log(`[pricing_calculation] ${shortlist.length}/${eligible.length} suppliers quoted, ${issues.length} issue(s), ${escalations.length} escalation(s)`);

  const result: NodeResult & { supplier_shortlist: ShortlistEntry[] } = {
    issues,
    escalations,
    reasonings,
    policy_violations,
    supplier_shortlist: shortlist,
  };
  return NextResponse.json(result);
}
