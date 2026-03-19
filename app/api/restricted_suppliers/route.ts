import { NextRequest, NextResponse } from "next/server";
import type { EligibleSupplier, Escalation, NodeResult, PolicyEvaluation, Reasoning, RequestData } from "@/lib/request-data";

// ── Policy restrictions (hardcoded from policies.json) ────────────────────────

type RestrictionType = "hard_country" | "exception_value_eur" | "exception_country";

type PolicyRestriction = {
  supplier_id: string;
  supplier_name: string;
  category_l1: string;
  category_l2: string;
  restriction_type: RestrictionType;
  restriction_scope: string[];
  restriction_reason: string;
  value_threshold_eur?: number;
  exception_escalate_to?: string;
};

const POLICY_RESTRICTIONS: PolicyRestriction[] = [
  {
    supplier_id: "SUP-0008",
    supplier_name: "Computacenter Devices",
    category_l1: "IT",
    category_l2: "Laptops",
    restriction_type: "hard_country",
    restriction_scope: ["CH", "DE"],
    restriction_reason: "Policy restriction for selected device sourcing events",
  },
  {
    supplier_id: "SUP-0008",
    supplier_name: "Computacenter Devices",
    category_l1: "IT",
    category_l2: "Mobile Workstations",
    restriction_type: "hard_country",
    restriction_scope: ["CH"],
    restriction_reason: "Country restriction in hackathon policy set",
  },
  {
    supplier_id: "SUP-0011",
    supplier_name: "AWS Enterprise EMEA",
    category_l1: "IT",
    category_l2: "Cloud Storage",
    restriction_type: "hard_country",
    restriction_scope: ["CH"],
    restriction_reason: "Swiss residency-sensitive data scenarios require sovereign or approved providers",
  },
  {
    supplier_id: "SUP-0045",
    supplier_name: "Boutique Creator Network",
    category_l1: "Marketing",
    category_l2: "Influencer Campaign Management",
    restriction_type: "exception_value_eur",
    restriction_scope: ["all"],
    restriction_reason: "Can be used only below EUR 75,000 without exception approval. Above this threshold, procurement exception approval is required.",
    value_threshold_eur: 75000,
    exception_escalate_to: "Procurement Manager",
  },
  {
    supplier_id: "SUP-0017",
    supplier_name: "Alibaba Cloud International",
    category_l1: "IT",
    category_l2: "Cloud Storage",
    restriction_type: "exception_country",
    restriction_scope: ["US", "CA", "AU", "IN"],
    restriction_reason: "Data sovereignty risk for sensitive/regulated data in listed jurisdictions. Requires Regional Compliance Lead exception approval for these countries.",
    exception_escalate_to: "Regional Compliance Lead",
  },
];

// Case-insensitive name similarity — any significant word overlap counts
function nameMatchesPreferred(supplierName: string, preferredRaw: string): boolean {
  if (!preferredRaw.trim()) return false;
  const sn = supplierName.toLowerCase();
  const pn = preferredRaw.toLowerCase().trim();
  if (sn.includes(pn) || pn.includes(sn)) return true;
  return sn.split(/\s+/).filter((w) => w.length > 3).some((w) => pn.includes(w));
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const data = await req.json() as RequestData;
  const interp = data.request_interpretation;

  const category_l1        = (interp.category_l1 ?? "").trim();
  const category_l2        = (interp.category_l2 ?? "").trim();
  const delivery_countries = interp.delivery_countries ?? [];
  const budget_amount      = interp.budget_amount ?? 0;
  const currency           = (interp.currency ?? "EUR").toUpperCase();
  const preferred_raw      = interp.preferred_supplier_mentioned ?? "";

  console.log(`[restricted_suppliers] (${category_l1} / ${category_l2}), ${data.eligible_suppliers.length} eligible supplier(s)`);

  const eligible = [...data.eligible_suppliers];

  const escalations:      Escalation[]      = [];
  const reasonings:       Reasoning[]       = [];
  const policy_violations: PolicyEvaluation[] = [];
  const new_excluded: { supplier_id: string; supplier_name: string; reason: string }[] = [];

  let step = 1;
  let esc  = 1;

  // ── Filter to restrictions applicable to this category ───────────────────
  const applicable = POLICY_RESTRICTIONS.filter(
    (r) => r.category_l1 === category_l1 && r.category_l2 === category_l2
  );

  if (applicable.length === 0) {
    reasonings.push({
      step_id: `R-RS-${String(step++).padStart(3, "0")}`,
      aspect:  "Restriction Policy Lookup",
      reasoning: `No policy restrictions defined for (${category_l1} / ${category_l2}). All ${eligible.length} eligible supplier(s) pass.`,
    });
  }

  const hardRemovedIds = new Set<string>();

  for (const restriction of applicable) {
    const inList = eligible.some((s) => s.supplier_id === restriction.supplier_id);
    const isPreferred = nameMatchesPreferred(restriction.supplier_name, preferred_raw);

    if (!inList) {
      reasonings.push({
        step_id: `R-RS-${String(step++).padStart(3, "0")}`,
        aspect:  `${restriction.supplier_id} — Not in shortlist`,
        reasoning: `Policy restriction exists for ${restriction.supplier_name} in (${restriction.category_l1} / ${restriction.category_l2}), but this supplier is not in the current eligible list. No action required.`,
      });
      continue;
    }

    // ── Hard country restriction ─────────────────────────────────────────
    if (restriction.restriction_type === "hard_country") {
      const hit = delivery_countries.filter((c) => restriction.restriction_scope.includes(c));
      if (hit.length > 0) {
        hardRemovedIds.add(restriction.supplier_id);
        const reason = `Hard policy restriction in [${hit.join(", ")}]: ${restriction.restriction_reason}`;
        new_excluded.push({ supplier_id: restriction.supplier_id, supplier_name: restriction.supplier_name, reason });
        policy_violations.push({ policy: `RESTR-${restriction.supplier_id}`, description: reason });
        reasonings.push({
          step_id: `R-RS-${String(step++).padStart(3, "0")}`,
          aspect:  `${restriction.supplier_id} — Hard Country Restriction`,
          reasoning: `${restriction.supplier_name} is hard-restricted for delivery countries [${hit.join(", ")}]. Reason: ${restriction.restriction_reason}. Supplier removed from eligible list.`,
        });
        if (isPreferred) {
          escalations.push({
            escalation_id: `ESC-RS-${String(esc++).padStart(3, "0")}`,
            rule:          "ER-002",
            trigger:       `Requester's preferred supplier "${preferred_raw}" (${restriction.supplier_name}) is restricted by policy for delivery in [${hit.join(", ")}]: ${restriction.restriction_reason}`,
            escalate_to:   "Procurement Manager",
            blocking:      false,
          });
          reasonings.push({
            step_id: `R-RS-${String(step++).padStart(3, "0")}`,
            aspect:  "ER-002 — Preferred Supplier Restricted",
            reasoning: `The requester explicitly preferred "${preferred_raw}", which maps to the hard-restricted supplier ${restriction.supplier_name}. This supplier cannot be used for the requested delivery countries. Escalated to Procurement Manager per ER-002.`,
          });
        }
      } else {
        reasonings.push({
          step_id: `R-RS-${String(step++).padStart(3, "0")}`,
          aspect:  `${restriction.supplier_id} — Hard Country Restriction`,
          reasoning: `${restriction.supplier_name} has a country restriction for [${restriction.restriction_scope.join(", ")}], but none of the requested delivery countries [${delivery_countries.join(", ")}] are in scope. Supplier passes.`,
        });
      }

    // ── Value-conditional exception ──────────────────────────────────────
    } else if (restriction.restriction_type === "exception_value_eur") {
      const overThreshold = currency === "EUR" && budget_amount >= (restriction.value_threshold_eur ?? Infinity);
      if (overThreshold) {
        policy_violations.push({ policy: `RESTR-${restriction.supplier_id}-VALUE`, description: restriction.restriction_reason });
        escalations.push({
          escalation_id: `ESC-RS-${String(esc++).padStart(3, "0")}`,
          rule:          "ER-002",
          trigger:       `${restriction.supplier_name} requires exception approval above EUR ${restriction.value_threshold_eur?.toLocaleString()}. Request budget: ${budget_amount} ${currency}.`,
          escalate_to:   restriction.exception_escalate_to ?? "Procurement Manager",
          blocking:      false,
        });
        reasonings.push({
          step_id: `R-RS-${String(step++).padStart(3, "0")}`,
          aspect:  `${restriction.supplier_id} — Value Exception Required`,
          reasoning: `${restriction.supplier_name} is permitted below EUR ${restriction.value_threshold_eur?.toLocaleString()} without approval. Budget of ${budget_amount} ${currency} exceeds this threshold — exception approval required from ${restriction.exception_escalate_to}. Supplier remains in shortlist pending approval.${isPreferred ? " NOTE: This is the requester's preferred supplier." : ""}`,
        });
      } else {
        reasonings.push({
          step_id: `R-RS-${String(step++).padStart(3, "0")}`,
          aspect:  `${restriction.supplier_id} — Value Exception`,
          reasoning: `${restriction.supplier_name} requires exception approval above EUR ${restriction.value_threshold_eur?.toLocaleString()}. Budget ${budget_amount} ${currency} is within the permitted range. Supplier passes without exception.`,
        });
      }

    // ── Country-scoped exception ──────────────────────────────────────────
    } else if (restriction.restriction_type === "exception_country") {
      const hit = delivery_countries.filter((c) => restriction.restriction_scope.includes(c));
      if (hit.length > 0) {
        policy_violations.push({ policy: `RESTR-${restriction.supplier_id}-GEO`, description: restriction.restriction_reason });
        escalations.push({
          escalation_id: `ESC-RS-${String(esc++).padStart(3, "0")}`,
          rule:          "ER-002",
          trigger:       `${restriction.supplier_name} requires exception approval for delivery in [${hit.join(", ")}]: ${restriction.restriction_reason}`,
          escalate_to:   restriction.exception_escalate_to ?? "Regional Compliance Lead",
          blocking:      false,
        });
        reasonings.push({
          step_id: `R-RS-${String(step++).padStart(3, "0")}`,
          aspect:  `${restriction.supplier_id} — Country Exception Required`,
          reasoning: `${restriction.supplier_name} requires exception approval for delivery in [${hit.join(", ")}]. Reason: ${restriction.restriction_reason}. Supplier remains in shortlist pending approval from ${restriction.exception_escalate_to}.${isPreferred ? " NOTE: This is the requester's preferred supplier." : ""}`,
        });
      } else {
        reasonings.push({
          step_id: `R-RS-${String(step++).padStart(3, "0")}`,
          aspect:  `${restriction.supplier_id} — Country Exception`,
          reasoning: `${restriction.supplier_name} has a country-exception restriction for [${restriction.restriction_scope.join(", ")}], but none of the delivery countries [${delivery_countries.join(", ")}] are in scope. Supplier passes.`,
        });
      }
    }
  }

  // ── Remove hard-restricted suppliers ─────────────────────────────────────
  const filteredEligible: EligibleSupplier[] = eligible.filter((s) => !hardRemovedIds.has(s.supplier_id));

  // ── ER-004 if no suppliers remain ─────────────────────────────────────────
  if (filteredEligible.length === 0 && eligible.length > 0) {
    escalations.push({
      escalation_id: `ESC-RS-${String(esc++).padStart(3, "0")}`,
      rule:          "ER-004",
      trigger:       `All ${eligible.length} eligible supplier(s) for (${category_l1} / ${category_l2}) were removed by policy restrictions.`,
      escalate_to:   "Head of Category",
      blocking:      true,
    });
    reasonings.push({
      step_id: `R-RS-${String(step++).padStart(3, "0")}`,
      aspect:  "ER-004 — No Compliant Suppliers Remain",
      reasoning: `After applying policy restrictions, no eligible suppliers remain for (${category_l1} / ${category_l2}). Pipeline blocked. Escalated to Head of Category.`,
    });
  } else {
    reasonings.push({
      step_id: `R-RS-${String(step++).padStart(3, "0")}`,
      aspect:  "Restriction Check Summary",
      reasoning: `${filteredEligible.length} supplier(s) remain after restrictions (${eligible.length - filteredEligible.length} removed): ${filteredEligible.map((s) => s.supplier_name ?? s.supplier_id).join(", ") || "none"}.`,
    });
  }

  console.log(`[restricted_suppliers] ${filteredEligible.length}/${eligible.length} suppliers remain`);

  const result: NodeResult & {
    eligible_suppliers: EligibleSupplier[];
    suppliers_excluded: { supplier_id: string; supplier_name: string; reason: string }[];
  } = {
    issues: [],
    escalations,
    reasonings,
    policy_violations,
    eligible_suppliers: filteredEligible,
    suppliers_excluded: new_excluded,
  };
  return NextResponse.json(result);
}
