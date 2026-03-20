import { NextRequest, NextResponse } from "next/server";
import type { Issue, NodeResult, Reasoning, RequestData } from "@/lib/request-data";
import { getSuppliersByName } from "@/lib/db";

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const data = await req.json() as RequestData;
  const interp = data.request_interpretation;

  const preferred_raw      = (interp.preferred_supplier_mentioned ?? "").trim();
  const category_l1        = (interp.category_l1 ?? "").trim();
  const category_l2        = (interp.category_l2 ?? "").trim();
  const delivery_countries = interp.delivery_countries ?? [];
  const currency           = (interp.currency ?? "").toUpperCase();

  console.log(`[evaluate_preferred_supplier] preferred="${preferred_raw}"`);

  const issues:    Issue[]    = [];
  const reasonings: Reasoning[] = [];

  let step = 1;

  // ── Guard: nothing specified ───────────────────────────────────────────────
  if (!preferred_raw) {
    reasonings.push({
      step_id:   `R-EPS-${String(step++).padStart(3, "0")}`,
      aspect:    "Preferred Supplier — Not Specified",
      reasoning: "No preferred supplier was mentioned in this request. Stage skipped.",
    });
    return NextResponse.json({ issues, escalations: [], reasonings, policy_violations: [] } satisfies NodeResult);
  }

  // ── Guard: supplier already in purely eligible shortlist ──────────────────
  const alreadyEligible = data.eligible_suppliers.some((s) => {
    const sn = (s.supplier_name ?? "").toLowerCase();
    const pn = preferred_raw.toLowerCase();
    return sn.includes(pn) || pn.includes(sn) ||
      sn.split(/\s+/).filter((w) => w.length > 3).some((w) => pn.includes(w));
  });

  if (alreadyEligible) {
    reasonings.push({
      step_id:   `R-EPS-${String(step++).padStart(3, "0")}`,
      aspect:    "Preferred Supplier — Present in Eligible Shortlist",
      reasoning: `"${preferred_raw}" is present in the eligible supplier shortlist. Restriction and geographic compliance checks are handled by the dedicated pipeline stages. No further action needed here.`,
    });
    return NextResponse.json({ issues, escalations: [], reasonings, policy_violations: [] } satisfies NodeResult);
  }

  // ── Supplier is NOT in shortlist: investigate why ─────────────────────────
  reasonings.push({
    step_id:   `R-EPS-${String(step++).padStart(3, "0")}`,
    aspect:    "Preferred Supplier — Not in Eligible Shortlist",
    reasoning: `"${preferred_raw}" is specified as the requester's preferred supplier but does not appear in the eligible shortlist from the initial category/currency/geography filter. Performing DB lookup to determine reason.`,
  });

  // ── DB lookup: search by name across all categories ──────────────────────
  const allRows = await getSuppliersByName(preferred_raw);

  // ── Step 1: Not found at all ──────────────────────────────────────────────
  if (!allRows.length) {
    reasonings.push({
      step_id:   `R-EPS-${String(step++).padStart(3, "0")}`,
      aspect:    "DB Lookup — Not Found",
      reasoning: `No supplier matching "${preferred_raw}" was found in the supplier database. The name may be misspelled or the supplier is not registered.`,
    });
    issues.push({
      issue_id:    "ISS-EPS-001",
      trigger:     `Preferred supplier "${preferred_raw}" is not registered in the system`,
      escalate_to: "Requester",
      blocking:    false,
      severity:    "high",
    });
    return NextResponse.json({ issues, escalations: [], reasonings, policy_violations: [] } satisfies NodeResult);
  }

  reasonings.push({
    step_id:   `R-EPS-${String(step++).padStart(3, "0")}`,
    aspect:    "DB Lookup — Found",
    reasoning: `Found ${allRows.length} row(s) for "${preferred_raw}" in the supplier database across categories: ${[...new Set(allRows.map((r) => `${r.category_l1} / ${r.category_l2}`))].join("; ")}.`,
  });

  // ── Step 2: Check category match ─────────────────────────────────────────
  const categoryMatches = allRows.filter(
    (r) => r.category_l1 === category_l1 && r.category_l2 === category_l2
  );

  if (!categoryMatches.length) {
    const registeredFor = [...new Set(allRows.map((r) => `${r.category_l1} / ${r.category_l2}`))].join("; ");
    reasonings.push({
      step_id:   `R-EPS-${String(step++).padStart(3, "0")}`,
      aspect:    "Category Check — Mismatch",
      reasoning: `"${preferred_raw}" is registered for [${registeredFor}], not for the requested category (${category_l1} / ${category_l2}). Requester preference is discarded.`,
    });
    issues.push({
      issue_id:    "ISS-EPS-001",
      trigger:     `Preferred supplier "${preferred_raw}" is registered for [${registeredFor}], not for (${category_l1} / ${category_l2})`,
      escalate_to: "Requester",
      blocking:    false,
      severity:    "high",
    });
    return NextResponse.json({ issues, escalations: [], reasonings, policy_violations: [] } satisfies NodeResult);
  }

  reasonings.push({
    step_id:   `R-EPS-${String(step++).padStart(3, "0")}`,
    aspect:    "Category Check — Match",
    reasoning: `"${preferred_raw}" is registered for (${category_l1} / ${category_l2}). Proceeding to geographic coverage check.`,
  });

  // ── Step 3: Check geographic coverage ────────────────────────────────────
  const geoMatches = categoryMatches.filter((r) => {
    if (!r.service_regions) return false;
    const covered = r.service_regions.split(";").map((c) => c.trim());
    return delivery_countries.every((dc) => covered.includes(dc));
  });

  if (!geoMatches.length) {
    // Find which countries are missing from the best-matching row
    const best = categoryMatches[0];
    const covered = best.service_regions ? best.service_regions.split(";").map((c) => c.trim()) : [];
    const missing = delivery_countries.filter((dc) => !covered.includes(dc));
    reasonings.push({
      step_id:   `R-EPS-${String(step++).padStart(3, "0")}`,
      aspect:    "Geographic Coverage — Mismatch",
      reasoning: `"${preferred_raw}" does not cover all required delivery countries. Missing coverage for: [${missing.join(", ")}]. Supplier service regions: [${covered.join(", ") || "none"}].`,
    });
    issues.push({
      issue_id:    "ISS-EPS-001",
      trigger:     `Preferred supplier "${preferred_raw}" does not cover delivery countries [${missing.join(", ")}]`,
      escalate_to: "Requester",
      blocking:    false,
      severity:    "high",
    });
    return NextResponse.json({ issues, escalations: [], reasonings, policy_violations: [] } satisfies NodeResult);
  }

  reasonings.push({
    step_id:   `R-EPS-${String(step++).padStart(3, "0")}`,
    aspect:    "Geographic Coverage — Match",
    reasoning: `"${preferred_raw}" covers all required delivery countries [${delivery_countries.join(", ")}]. Proceeding to currency check.`,
  });

  // ── Step 4: Check currency ────────────────────────────────────────────────
  const currencyMatches = geoMatches.filter(
    (r) => (r.currency ?? "").toUpperCase() === currency
  );

  if (!currencyMatches.length) {
    const supplierCurrencies = [...new Set(geoMatches.map((r) => r.currency ?? "unknown"))].join(", ");
    reasonings.push({
      step_id:   `R-EPS-${String(step++).padStart(3, "0")}`,
      aspect:    "Currency Check — Mismatch",
      reasoning: `"${preferred_raw}" does not accept payments in ${currency}. Supplier prices in: [${supplierCurrencies}]. Request currency is ${currency}.`,
    });
    issues.push({
      issue_id:    "ISS-EPS-001",
      trigger:     `Preferred supplier "${preferred_raw}" does not accept payments in ${currency} (prices in ${supplierCurrencies})`,
      escalate_to: "Requester",
      blocking:    false,
      severity:    "high",
    });
    return NextResponse.json({ issues, escalations: [], reasonings, policy_violations: [] } satisfies NodeResult);
  }

  // ── All checks passed — supplier meets basic criteria ────────────────────
  // (Shouldn't normally reach here if they weren't in the eligible list, but log it)
  reasonings.push({
    step_id:   `R-EPS-${String(step++).padStart(3, "0")}`,
    aspect:    "All Checks Passed",
    reasoning: `"${preferred_raw}" passes category, geographic, and currency checks. The supplier may still be subject to restriction or geographic compliance rules evaluated in parallel stages.`,
  });

  return NextResponse.json({ issues, escalations: [], reasonings, policy_violations: [] } satisfies NodeResult);
}
