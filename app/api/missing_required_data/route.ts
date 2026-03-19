import { NextRequest, NextResponse } from "next/server";

function collectMissingFields(obj: Record<string, unknown>, prefix = ""): string[] {
  const missing: string[] = [];
  for (const [key, val] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (val === null || val === undefined || val === "") {
      missing.push(path);
    } else if (typeof val === "object" && !Array.isArray(val)) {
      missing.push(...collectMissingFields(val as Record<string, unknown>, path));
    }
  }
  return missing;
}

export async function POST(req: NextRequest) {
  const body: unknown = await req.json();

  const interpretation = body as Record<string, unknown> | null;

  if (!interpretation || typeof interpretation !== "object" || Array.isArray(interpretation)) {
    console.log("[missing_required_data] no valid interpretation object received");
    return NextResponse.json({ escalations: [], reasonings: [], issues: [], policy_violations: [] });
  }

  const missing = collectMissingFields(interpretation);

  if (missing.length === 0) {
    console.log("[missing_required_data] all fields populated — no issues");
  } else {
    console.log(`[missing_required_data] ${missing.length} missing field(s):`, missing);
  }

  const escalations = missing.map((field, i) => ({
    escalation_id: `ESC-MRD-${String(i + 1).padStart(3, "0")}`,
    rule: "ER-002",
    trigger: `Required field "${field}" is null or empty`,
    escalate_to: "Requester",
    blocking: true,
  }));

  const reasonings = [
    {
      step_id: "R-MRD-001",
      aspect: "Missing Required Data",
      reasoning:
        missing.length === 0
          ? "All fields in request_interpretation are populated."
          : `Found ${missing.length} missing or empty field(s): ${missing.join(", ")}.`,
    },
  ];

  return NextResponse.json({ escalations, reasonings, issues: [], policy_violations: [] });
}
