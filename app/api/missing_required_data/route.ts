import { NextRequest, NextResponse } from "next/server";
import type { Escalation, Reasoning, NodeResult } from "@/lib/request-data";

const REQUIRED_FIELDS = [
  "business_unit",
  "country",
  "category_l1",
  "category_l2",
  "request_text",
  "quantity",
  "unit_of_measure",
  "currency",
  "budget_amount",
  "required_by_date",
] as const;

export async function POST(req: NextRequest) {
  const body = await req.json() as Record<string, unknown>;

  const missing: string[] = [];

  for (const field of REQUIRED_FIELDS) {
    const val = body[field];
    if (val === null || val === undefined || val === "") {
      missing.push(field);
    }
  }

  const deliveryCountries = body["delivery_countries"];
  if (!Array.isArray(deliveryCountries) || deliveryCountries.length === 0) {
    missing.push("delivery_countries");
  }

  const escalations: Escalation[] = missing.length > 0
    ? [
        {
          escalation_id: "ESC-MRD-001",
          rule: "ER-001",
          trigger: `Missing or empty required field(s): ${missing.join(", ")}`,
          escalate_to: "Requester",
          blocking: true,
        },
      ]
    : [];

  const reasonings: Reasoning[] = [
    {
      step_id: "R-MRD-001",
      aspect: "Required Field Completeness",
      reasoning:
        missing.length === 0
          ? "All required fields are present and non-empty. Processing can continue."
          : `Pipeline terminated: ${missing.length} required field(s) are missing or empty (${missing.join(", ")}). Manual completion by the Requester is needed before this request can be evaluated.`,
    },
  ];

  console.log(
    missing.length === 0
      ? "[missing_required_data] all required fields populated"
      : `[missing_required_data] ${missing.length} missing field(s): ${missing.join(", ")}`
  );

  const result: NodeResult = { escalations, reasonings, issues: [], policy_violations: [] };
  return NextResponse.json(result);
}
