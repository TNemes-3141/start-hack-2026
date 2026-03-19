import { NextRequest, NextResponse } from "next/server";
import type { EligibleSupplier, Escalation, NodeResult, Reasoning } from "@/lib/request-data";

type SupplierRow = EligibleSupplier;

export async function POST(req: NextRequest) {
  const body = await req.json() as Record<string, unknown>;

  const category_l1      = (body["category_l1"]      ?? "") as string;
  const category_l2      = (body["category_l2"]      ?? "") as string;
  const currency         = (body["currency"]          ?? "") as string;
  const delivery_countries = Array.isArray(body["delivery_countries"])
    ? (body["delivery_countries"] as string[])
    : [];

  console.log(`[purely_eligible_suppliers] (${category_l1} / ${category_l2}), currency=${currency}, delivery_countries=${delivery_countries.join(",")}`);

  const escalations: Escalation[] = [];
  const reasonings: Reasoning[]   = [];

  // ── 1. Fetch suppliers matching category + currency from Supabase ─────────
  const params = new URLSearchParams({
    category_l1: `eq.${category_l1}`,
    category_l2: `eq.${category_l2}`,
    currency:    `eq.${currency}`,
  });

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/suppliers?${params.toString()}`,
    {
      headers: {
        apikey:        process.env.NEXT_SUPABASE_SECRET_KEY!,
        Authorization: `Bearer ${process.env.NEXT_SUPABASE_SECRET_KEY!}`,
      },
    }
  );

  const rows: SupplierRow[] = await res.json();

  reasonings.push({
    step_id:   "R-ES-001",
    aspect:    "DB Lookup",
    reasoning: `Fetched ${rows.length} supplier row(s) from DB matching category (${category_l1} / ${category_l2}) and currency ${currency}.`,
  });

  // ── 2. Filter by service_regions covering all delivery_countries ───────────
  const eligible = rows.filter((s) => {
    if (!s.service_regions) return false;
    const covered = s.service_regions.split(";").map((c) => c.trim());
    return delivery_countries.every((dc) => covered.includes(dc));
  });

  reasonings.push({
    step_id:   "R-ES-002",
    aspect:    "Geographic Filter",
    reasoning: eligible.length > 0
      ? `${eligible.length} supplier(s) cover all required delivery countries (${delivery_countries.join(", ")}): ${eligible.map((s) => s.supplier_name ?? s.supplier_id).join(", ")}.`
      : `No suppliers cover all required delivery countries (${delivery_countries.join(", ")}). All ${rows.length} candidate(s) were filtered out.`,
  });

  // ── 3. Escalate ER-004 if no eligible suppliers remain ────────────────────
  if (eligible.length === 0) {
    escalations.push({
      escalation_id: "ESC-ES-001",
      rule:          "ER-004",
      trigger:       `No supplier found for (${category_l1} / ${category_l2}) in currency ${currency} covering all delivery countries: ${delivery_countries.join(", ")}`,
      escalate_to:   "Head of Category",
      blocking:      true,
    });
  }

  console.log(`[purely_eligible_suppliers] ${eligible.length} eligible supplier(s) after geographic filter`);

  const result: NodeResult & { eligible_suppliers: EligibleSupplier[] } = {
    issues:           [],
    escalations,
    reasonings,
    policy_violations: [],
    eligible_suppliers: eligible,
  };
  return NextResponse.json(result);
}
