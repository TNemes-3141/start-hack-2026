import { NextRequest, NextResponse } from "next/server";
import type { Escalation, Reasoning, NodeResult } from "@/lib/request-data";

type CategoryRow = {
  category_l1: string;
  category_l2: string;
  category_description: string | null;
  typical_unit: string | null;
  pricing_model: string | null;
};

async function queryCategory(category_l1: string, category_l2: string): Promise<CategoryRow | null> {
  const url = new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/categories`);
  url.searchParams.set("category_l1", `eq.${category_l1}`);
  url.searchParams.set("category_l2", `eq.${category_l2}`);
  url.searchParams.set("limit", "1");

  const res = await fetch(url.toString(), {
    headers: {
      apikey: process.env.NEXT_SUPABASE_SECRET_KEY!,
      Authorization: `Bearer ${process.env.NEXT_SUPABASE_SECRET_KEY!}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase REST error ${res.status}: ${text}`);
  }

  const rows = await res.json() as CategoryRow[];
  return rows.length > 0 ? rows[0] : null;
}

export async function POST(req: NextRequest) {
  const body = await req.json() as Record<string, unknown>;

  const category_l1 = (body["category_l1"] ?? "") as string;
  const category_l2 = (body["category_l2"] ?? "") as string;
  const unit_of_measure = (body["unit_of_measure"] ?? "") as string;

  console.log(`[check_available_products] looking up (${category_l1}, ${category_l2})`);

  const escalations: Escalation[] = [];
  const reasonings: Reasoning[] = [];

  const row = await queryCategory(category_l1, category_l2);

  if (!row) {
    console.log(`[check_available_products] category not found — raising ER-004`);
    reasonings.push({
      step_id: "R-CAP-001",
      aspect: "Category Lookup",
      reasoning: `No entry found in the categories table for (category_l1="${category_l1}", category_l2="${category_l2}"). No supplier could be identified that matches the requested product.`,
    });
    escalations.push({
      escalation_id: "ESC-CAP-001",
      rule: "ER-004",
      trigger: `Category (${category_l1} / ${category_l2}) not found in the product catalog`,
      escalate_to: "Head of Category",
      blocking: true,
    });
  } else {
    console.log(`[check_available_products] category found, typical_unit="${row.typical_unit}"`);
    reasonings.push({
      step_id: "R-CAP-001",
      aspect: "Category Lookup",
      reasoning: `Category (category_l1="${category_l1}", category_l2="${category_l2}") exists in the catalog. Description: ${row.category_description ?? "n/a"}.`,
    });

    const typicalUnit = (row.typical_unit ?? "").trim().toLowerCase();
    const requestedUnit = unit_of_measure.trim().toLowerCase();

    if (typicalUnit && requestedUnit && typicalUnit !== requestedUnit) {
      console.log(`[check_available_products] unit mismatch: requested="${requestedUnit}", typical="${typicalUnit}" — raising ER-001`);
      reasonings.push({
        step_id: "R-CAP-002",
        aspect: "Unit of Measure Consistency",
        reasoning: `The requested unit_of_measure "${unit_of_measure}" does not match the typical unit "${row.typical_unit}" for this category. This is inconsistent with how this product is supplied.`,
      });
      escalations.push({
        escalation_id: "ESC-CAP-002",
        rule: "ER-001",
        trigger: `unit_of_measure "${unit_of_measure}" is inconsistent with typical unit "${row.typical_unit}" for category (${category_l1} / ${category_l2})`,
        escalate_to: "Requester",
        blocking: true,
      });
    } else {
      reasonings.push({
        step_id: "R-CAP-002",
        aspect: "Unit of Measure Consistency",
        reasoning:
          typicalUnit && requestedUnit
            ? `Requested unit "${unit_of_measure}" matches the typical unit "${row.typical_unit}" for this category.`
            : `Unit of measure check skipped: one or both values are absent (requested="${unit_of_measure}", typical="${row.typical_unit ?? ""}").`,
      });
    }
  }

  const result: NodeResult = { escalations, reasonings, issues: [], policy_violations: [] };
  return NextResponse.json(result);
}
