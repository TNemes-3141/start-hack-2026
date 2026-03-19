import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";

const client = new OpenAI();

const PROMPT = `Act as a Senior Procurement Consultant. Your task is to transform a raw RAG Pipeline JSON report into a high-end, professional "Procurement Analysis Report" for a corporate client.

### OUTPUT FORMAT
Return ONLY valid HTML5 code. Use Tailwind CSS via CDN for styling. The design should be minimalist, executive, and high-contrast (corporate aesthetic).

### DATA SOURCE
{{RequestData}}

### DOCUMENT SECTIONS TO GENERATE:

1. **Executive Summary Header:**
   - Display the Request Title, ID, and Date.
   - Status Badge: Use a clear visual indicator for the "recommendation.status" (e.g., Red for Blocked/Escalated, Green for Approved).
   - Summary Statement: A 2-sentence non-technical explanation of the "recommendation.reason".

2. **Request Interpretation (The "What"):**
   - A clean 2-column grid showing the Category, Budget ($50,000 CHF), Quantity, and Delivery Country.

3. **Supplier Intelligence & Shortlist:**
   - **Preferred Supplier Analysis:** Highlight the "preferred_supplier_mentioned" (Beliani). Explain clearly that they were not found in the database (from evaluate_preferred_supplier stage).
   - **Shortlist Table:** List the "eligible_suppliers". If empty (as in this JSON), provide a "Market Gap Warning" explaining that no suppliers currently meet the criteria for [Category] in [Country].

4. **Policy & Compliance (The "Why"):**
   - **Approval Tier:** Explicitly state that this is Tier 2, requiring 2 quotes and specific approvers (Business & Procurement).
   - **Audit Trail:** List the policies checked (Geography, Restricted Suppliers, etc.) to build trust.
   - **Internal Coherence:** Note any missing data from the original request (e.g., missing currency or specific category labels) as "System Clarifications."

5. **Actionable Next Steps:**
   - Translate the "escalations" into a "How to resolve" section.
   - Example: "This request has been escalated to the Head of Category because no local suppliers were found. Action required: Expand search to EU or manually onboard Beliani."

### DESIGN CONSTRAINTS:
- Use 'font-sans'.
- Use Soft Grays for backgrounds ('bg-gray-50') and Primary Navy for headers.
- Use Icons (SVG or Emoji) for status checks (✅, ⚠️, ❌).
- Ensure the PDF has clear page breaks (CSS: 'page-break-after: always').
- **NO JSON SYNTAX:** The client should never see keys like "category_l1" or "step_id". Use "Primary Category" and "Verification Step".

### TONE:
Professional, transparent, and authoritative.`;

export async function POST(req: NextRequest) {
  const body = await req.json();

  const prompt = PROMPT.replace("{{RequestData}}", JSON.stringify(body, null, 2));

  const completion = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: prompt },
    ],
  });

  const raw = completion.choices[0].message.content ?? "";
  // Strip markdown code fences if the model wraps the HTML
  const html = raw.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
  await browser.close();

  return new NextResponse(Buffer.from(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="procurement-report-${body.request_id ?? "report"}.pdf"`,
    },
  });
}
