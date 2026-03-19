import { NextRequest, NextResponse } from "next/server";

// TODO: replace stub with real Supabase query once DB schema is confirmed
// e.g. import postgres from "postgres";
// const sql = postgres(process.env.POSTGRES_URL!);

async function isProductAvailable(_category: string, _interpretation: unknown): Promise<boolean> {
  // TODO: query Supabase for matching products by category / SKU / description
  // e.g. const rows = await sql`SELECT id FROM products WHERE category = ${category} LIMIT 1`;
  // return rows.length > 0;
  return true; // stub: assume available until DB is wired up
}

export async function POST(req: NextRequest) {
  const body: unknown = await req.json();

  const interpretation = body as Record<string, unknown> | undefined;
  const category = (interpretation?.category_l2 ?? interpretation?.category_l1 ?? "") as string;

  console.log(`[check_available_products] checking category: "${category}"`);
  const available = await isProductAvailable(category, interpretation);
  console.log(`[check_available_products] available: ${available}`);

  const escalations = available
    ? []
    : [
        {
          escalation_id: "ESC-CAP-001",
          rule: "ER-004",
          trigger: `No available product found for category "${category}"`,
          escalate_to: "Head of Category",
          blocking: true,
        },
      ];

  const reasonings = [
    {
      step_id: "R-CAP-001",
      aspect: "Product Availability",
      reasoning: available
        ? `Product found for category "${category}".`
        : `No matching product in the catalog for category "${category}". ER-004 escalation raised.`,
    },
  ];

  return NextResponse.json({ escalations, reasonings, issues: [], policy_violations: [] });
}
