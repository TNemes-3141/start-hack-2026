import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import chromium from "@sparticuz/chromium";
import puppeteerCore from "puppeteer-core";

const client = new OpenAI();

const PROMPT = `Act as a Senior Procurement Analyst. Transform the provided 'RequestData' JSON into a high-end, board-ready "Procurement Intelligence Report."

### DATA INPUT
{{RequestData}}

### STYLE & DESIGN GUIDELINES (Strict Compliance)
1. **No Icons/Emojis:** Use bold text, borders, and background shading to denote status. 
2. **Typography:** Use a clean Sans-Serif stack (Inter/Helvetica). Headers must be All-Caps with increased letter spacing.
3. **Color Palette:** - Primary: Deep Navy (#0F172A) for headers.
   - Accent: Slate Gray (#64748B) for sub-headers.
   - Status: Use "Soft Red" (#FEE2E2) backgrounds for Blocked/Escalated items and "Soft Blue" (#DBEAFE) for Informational items.
4. **Layout:** - 12pt base font size. 
   - Use 1px Solid Borders for tables and section dividers. 
   - No rounded corners; use sharp, professional edges.
5. **Print Optimization:** Include CSS 'page-break-inside: avoid;' for sections to ensure the PDF doesn't cut text awkwardly.

### DOCUMENT STRUCTURE

**1. COVER HEADER**
- Title: "PROCUREMENT AUTHENTICATION & STRATEGY REPORT"
- Metadata: Display Request ID, Date, and Requester Role in a clean horizontal bar.
- Final Status: A large, boxed status (e.g., "STATUS: ESCALATED") using a high-contrast background.

**2. EXECUTIVE INTERPRETATION**
- Present the "Request Interpretation" block. 
- Map JSON values to professional labels: 
  - 'budget_amount' -> "Allocated Capital"
  - 'category_l2' -> "Procurement Category"
  - 'delivery_countries' -> "Logistics Destination"

**3. CRITICAL FINDINGS: PREFERRED SUPPLIER**
- Detail the analysis of "Beliani". 
- State clearly that the supplier is "Unregistered" or "Database Mismatch." 
- Reference the specific reasoning from 'evaluate_preferred_supplier' (e.g., "Manual DB lookup returned no matches for the specified entity").

**4. COMPLIANCE & GOVERNANCE (Audit Trail)**
- **Approval Tiering:** Detail the requirements for Tier 2 (budget > 50k CHF). List specific required signatories (Business/Procurement).
- **Policy Verification:** Create a list of all "policies_checked" from the audit trail. Label each as "VERIFIED" or "EXCEPTION TRIGGERED".
- **Internal Coherence:** List the "reasonings" from the 'internal_coherence' stage. Focus on what was validated (e.g., Budget/Quantity) vs what was missing (e.g., Timeline).

**5. MARKET GAP & ESCALATION**
- Explain the 'purely_eligible_suppliers' failure: "Zero suppliers found matching Category + Currency + Geography."
- List the 'escalations' as "Mandatory Remediation Steps." 
- Example: "ESCALATION ID ESC-ES-001: Requires Head of Category intervention due to regional supply gap."

### OUTPUT REQUIREMENTS
- Return ONLY HTML/CSS.
- Do not explain the code. 
- Ensure the HTML is self-contained (Tailwind CSS via CDN is permitted).`;

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

  const browser = await puppeteerCore.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
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
