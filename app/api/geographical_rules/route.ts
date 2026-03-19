import { NextRequest, NextResponse } from "next/server";
import type { EligibleSupplier, Escalation, Issue, IssueSeverity, NodeResult, PolicyEvaluation, Reasoning, RequestData } from "@/lib/request-data";

// ── Static sets ────────────────────────────────────────────────────────────────

const CLOUD_CATEGORY_L2 = new Set([
  "Cloud Storage", "Cloud Compute", "Managed Cloud Platform Services", "Cloud Security",
  "Cloud Infrastructure", "Cloud Platform", "SaaS", "PaaS", "IaaS",
]);

const DATA_SOVEREIGN_CATEGORY_L1 = new Set(["IT", "Professional Services"]);

const APAC_COUNTRIES  = new Set(["SG", "AU", "JP", "IN"]);
const MEA_COUNTRIES   = new Set(["UAE", "ZA"]);
const LATAM_COUNTRIES = new Set(["BR", "MX"]);

// ── Name-match helper ─────────────────────────────────────────────────────────

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
  const data_residency     = interp.data_residency_constraint ?? false;
  const preferred_raw      = interp.preferred_supplier_mentioned ?? "";

  console.log(`[geographical_rules] (${category_l1} / ${category_l2}), countries=[${delivery_countries.join(",")}], data_residency=${data_residency}, ${data.eligible_suppliers.length} supplier(s)`);

  let eligible = [...data.eligible_suppliers];

  const issues:             Issue[]            = [];
  const escalations:        Escalation[]       = [];
  const reasonings:         Reasoning[]        = [];
  const policy_violations:  PolicyEvaluation[] = [];
  const new_excluded: { supplier_id: string; supplier_name: string; reason: string }[] = [];

  let step = 1;
  let esc  = 1;
  let iss  = 1;

  const removedIds = new Set<string>();

  function hardRemove(supplier: EligibleSupplier, rule_id: string, reason: string) {
    if (removedIds.has(supplier.supplier_id)) return;
    removedIds.add(supplier.supplier_id);
    new_excluded.push({ supplier_id: supplier.supplier_id, supplier_name: supplier.supplier_name ?? supplier.supplier_id, reason });

    if (nameMatchesPreferred(supplier.supplier_name ?? "", preferred_raw)) {
      escalations.push({
        escalation_id: `ESC-GR-${String(esc++).padStart(3, "0")}`,
        rule:          "ER-002",
        trigger:       `Requester's preferred supplier "${preferred_raw}" (${supplier.supplier_name}) removed by ${rule_id}: ${reason}`,
        escalate_to:   "Procurement Manager",
        blocking:      false,
      });
      reasonings.push({
        step_id:   `R-GR-${String(step++).padStart(3, "0")}`,
        aspect:    `ER-002 — Preferred Supplier Removed by ${rule_id}`,
        reasoning: `The requester's preferred supplier "${preferred_raw}" cannot be used because it fails geographic compliance rule ${rule_id}: ${reason}. Escalated to Procurement Manager per ER-002.`,
      });
    }
  }

  function softIssue(rule_id: string, aspect: string, message: string, severity: IssueSeverity) {
    issues.push({
      issue_id:    `ISS-GR-${String(iss++).padStart(3, "0")}`,
      trigger:     `${rule_id}: ${aspect}`,
      escalate_to: "Requester",
      blocking:    false,
      severity,
    });
    reasonings.push({
      step_id:   `R-GR-${String(step++).padStart(3, "0")}`,
      aspect:    `${rule_id} — ${aspect}`,
      reasoning: message,
    });
    // Policy evaluation entry for every triggered soft rule
    policy_violations.push({ policy: rule_id, description: message });
  }

  // ── HARD FILTER 1: Explicit data residency constraint ─────────────────────
  if (data_residency) {
    const nonCompliant = eligible.filter((s) => s.data_residency_supported === false);
    if (nonCompliant.length > 0) {
      for (const s of nonCompliant) {
        reasonings.push({
          step_id:  `R-GR-${String(step++).padStart(3, "0")}`,
          aspect:   `DATA-RESIDENCY — ${s.supplier_name}`,
          reasoning: `data_residency_constraint=true. Supplier ${s.supplier_name} (${s.supplier_id}) does not support data residency. Removed.`,
        });
        hardRemove(s, "DATA-RESIDENCY", "Supplier does not support data residency, which is required for this request");
      }
      policy_violations.push({
        policy:      "DATA-RESIDENCY",
        description: `Data residency constraint is active. ${nonCompliant.length} supplier(s) removed for lacking data residency support.`,
      });
    } else {
      reasonings.push({
        step_id:  `R-GR-${String(step++).padStart(3, "0")}`,
        aspect:   "DATA-RESIDENCY — Check",
        reasoning: `data_residency_constraint=true. All ${eligible.length} eligible supplier(s) support data residency. No removals.`,
      });
      policy_violations.push({
        policy:      "DATA-RESIDENCY",
        description: `Data residency constraint evaluated. All eligible suppliers are compliant.`,
      });
    }
    eligible = eligible.filter((s) => !removedIds.has(s.supplier_id));
  } else {
    reasonings.push({
      step_id:  `R-GR-${String(step++).padStart(3, "0")}`,
      aspect:   "DATA-RESIDENCY — Not Required",
      reasoning: "data_residency_constraint=false. Data residency hard filter not applied.",
    });
  }

  // ── HARD FILTER 2: GR-001 — CH + cloud categories ────────────────────────
  const chDelivery      = delivery_countries.includes("CH");
  const isCloudCategory = CLOUD_CATEGORY_L2.has(category_l2);

  if (chDelivery && isCloudCategory) {
    const nonSovereign = eligible.filter((s) => s.data_residency_supported !== true);
    if (nonSovereign.length > 0) {
      for (const s of nonSovereign) {
        reasonings.push({
          step_id:  `R-GR-${String(step++).padStart(3, "0")}`,
          aspect:   `GR-001 — ${s.supplier_name}`,
          reasoning: `GR-001: CH delivery + cloud category "${category_l2}". Supplier ${s.supplier_name} does not confirm data residency support. Removed — sovereign or approved provider required.`,
        });
        hardRemove(s, "GR-001", "Swiss cloud data residency rule requires sovereign/approved provider; supplier does not confirm data residency support");
      }
      policy_violations.push({
        policy:      "GR-001",
        description: `GR-001 evaluated and triggered: CH delivery + cloud category. ${nonSovereign.length} supplier(s) removed for lacking sovereign/data-residency support.`,
      });
    } else {
      reasonings.push({
        step_id:  `R-GR-${String(step++).padStart(3, "0")}`,
        aspect:   "GR-001 — Swiss Cloud Sovereignty",
        reasoning: `GR-001 applies (CH + "${category_l2}"). All remaining eligible suppliers confirm data residency support. No removals.`,
      });
      policy_violations.push({
        policy:      "GR-001",
        description: `GR-001 evaluated: CH + cloud category. All eligible suppliers are compliant sovereign/approved providers.`,
      });
    }
    eligible = eligible.filter((s) => !removedIds.has(s.supplier_id));
  } else {
    reasonings.push({
      step_id:  `R-GR-${String(step++).padStart(3, "0")}`,
      aspect:   "GR-001 — Swiss Cloud Sovereignty",
      reasoning: `GR-001 not applicable: ${!chDelivery ? "CH not in delivery countries" : `"${category_l2}" is not a cloud-related category`}.`,
    });
  }

  // ── HARD FILTER 3: GR-005 — US data sovereignty ───────────────────────────
  const usDelivery        = delivery_countries.includes("US");
  const isDataSovCategory = DATA_SOVEREIGN_CATEGORY_L1.has(category_l1);

  if (usDelivery && isDataSovCategory) {
    if (data_residency) {
      // Already covered by explicit data-residency filter above
      reasonings.push({
        step_id:  `R-GR-${String(step++).padStart(3, "0")}`,
        aspect:   "GR-005 — US Data Sovereignty",
        reasoning: `GR-005 applies (US + ${category_l1}). Non-compliant suppliers already removed by the explicit data-residency constraint check above.`,
      });
    } else {
      const nonCompliantUS = eligible.filter((s) => s.data_residency_supported === false);
      if (nonCompliantUS.length > 0) {
        for (const s of nonCompliantUS) {
          reasonings.push({
            step_id:  `R-GR-${String(step++).padStart(3, "0")}`,
            aspect:   `GR-005 — ${s.supplier_name}`,
            reasoning: `GR-005: US delivery + ${category_l1}. Financial and healthcare data must remain in-country. Supplier ${s.supplier_name} does not support data residency. Removed.`,
          });
          hardRemove(s, "GR-005", `US data sovereignty rule for ${category_l1} requires in-country data processing capability`);
        }
        policy_violations.push({
          policy:      "GR-005",
          description: `GR-005 evaluated and triggered: US delivery + ${category_l1}. ${nonCompliantUS.length} supplier(s) removed for lacking US data residency capability.`,
        });
      } else {
        reasonings.push({
          step_id:  `R-GR-${String(step++).padStart(3, "0")}`,
          aspect:   "GR-005 — US Data Sovereignty",
          reasoning: `GR-005 applies (US + ${category_l1}). All remaining eligible suppliers support data residency. No removals needed.`,
        });
        policy_violations.push({
          policy:      "GR-005",
          description: `GR-005 evaluated: US + ${category_l1}. All eligible suppliers meet US data sovereignty requirements.`,
        });
      }
      eligible = eligible.filter((s) => !removedIds.has(s.supplier_id));
    }
    // Always record GR-005 was evaluated when applicable
    if (data_residency) {
      policy_violations.push({
        policy:      "GR-005",
        description: `GR-005 evaluated: US + ${category_l1}. Covered by explicit data-residency constraint check.`,
      });
    }
  } else {
    reasonings.push({
      step_id:  `R-GR-${String(step++).padStart(3, "0")}`,
      aspect:   "GR-005 — US Data Sovereignty",
      reasoning: `GR-005 not applicable: ${!usDelivery ? "US not in delivery countries" : `category ${category_l1} is not subject to GR-005`}.`,
    });
  }

  // ── ER-005: no suppliers remain after hard filters ────────────────────────
  if (eligible.length === 0 && data.eligible_suppliers.length > 0) {
    escalations.push({
      escalation_id: `ESC-GR-${String(esc++).padStart(3, "0")}`,
      rule:          "ER-005",
      trigger:       `All suppliers removed by geographic/data-residency rules for (${category_l1} / ${category_l2}), delivery countries [${delivery_countries.join(", ")}].`,
      escalate_to:   "Security/Compliance",
      blocking:      true,
    });
    reasonings.push({
      step_id:  `R-GR-${String(step++).padStart(3, "0")}`,
      aspect:   "ER-005 — No Compliant Suppliers After Geo Filters",
      reasoning: `After applying geographic and data residency rules, no eligible suppliers remain. Data residency or sovereignty constraints cannot be satisfied. Pipeline blocked — escalated to Security/Compliance per ER-005.`,
    });
  } else if (removedIds.size > 0) {
    reasonings.push({
      step_id:  `R-GR-${String(step++).padStart(3, "0")}`,
      aspect:   "Hard Filter Summary",
      reasoning: `${removedIds.size} supplier(s) removed by geographic/data-residency rules. ${eligible.length} remain: ${eligible.map((s) => s.supplier_name ?? s.supplier_id).join(", ")}.`,
    });
  }

  // ── SOFT: GR-002 — DE lead time urgency ──────────────────────────────────
  if (delivery_countries.includes("DE")) {
    softIssue("GR-002", "Germany Lead Time Urgency",
      "GR-002: Urgent end-user-device requests in Germany require delivery capability within the requested deadline. Lead time compliance will be verified in the pricing stage.",
      "low");
  }

  // ── SOFT: GR-003 — FR language support ───────────────────────────────────
  if (delivery_countries.includes("FR")) {
    softIssue("GR-003", "France Language Support",
      "GR-003: Business-facing services for France should support French-language delivery where relevant. Verify with selected supplier before award.",
      "low");
  }

  // ── SOFT: GR-004 — ES deployment support ─────────────────────────────────
  if (delivery_countries.includes("ES")) {
    softIssue("GR-004", "Spain Deployment Support",
      "GR-004: Large furniture and device rollouts in Spain should evidence installation or deployment support capability. Confirm with selected supplier.",
      "low");
  }

  // ── SOFT: GR-006 — APAC data localisation ────────────────────────────────
  const apacHit = delivery_countries.filter((c) => APAC_COUNTRIES.has(c));
  if (apacHit.length > 0 && DATA_SOVEREIGN_CATEGORY_L1.has(category_l1)) {
    softIssue("GR-006", `APAC Data Localisation (${apacHit.join(", ")})`,
      `GR-006: Delivery to ${apacHit.join(", ")} in category ${category_l1}. India RBI, Singapore MAS, and Japan FISC guidelines apply to financial data. Verify supplier in-country data residency compliance for regulated categories before final award.`,
      "critical");
  }

  // ── SOFT: GR-007 — MEA compliance ────────────────────────────────────────
  const meaHit = delivery_countries.filter((c) => MEA_COUNTRIES.has(c));
  if (meaHit.length > 0 && DATA_SOVEREIGN_CATEGORY_L1.has(category_l1)) {
    softIssue("GR-007", `MEA Data Compliance (${meaHit.join(", ")})`,
      `GR-007: Delivery to ${meaHit.join(", ")} in category ${category_l1}. UAE PDPL and South Africa POPIA compliance required for personal data processing. Validate supplier compliance documentation before contract award.`,
      "critical");
  }

  // ── SOFT: GR-008 — LATAM data protection ─────────────────────────────────
  const latamHit = delivery_countries.filter((c) => LATAM_COUNTRIES.has(c));
  const latamCategoryL1 = new Set(["IT", "Professional Services", "Marketing"]);
  if (latamHit.length > 0 && latamCategoryL1.has(category_l1)) {
    softIssue("GR-008", `LATAM Data Protection (${latamHit.join(", ")})`,
      `GR-008: Delivery to ${latamHit.join(", ")} in category ${category_l1}. Brazil LGPD and Mexico LFPDPPP apply. Data processing agreements (DPA) must be in place before contract signature.`,
      "critical");
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  if (removedIds.size === 0 && issues.length === 0) {
    reasonings.push({
      step_id:  `R-GR-${String(step++).padStart(3, "0")}`,
      aspect:   "Geography Rules Summary",
      reasoning: `No geographic or data-residency rules triggered for delivery countries [${delivery_countries.join(", ")}], category (${category_l1} / ${category_l2}). All ${eligible.length} supplier(s) pass.`,
    });
  }

  console.log(`[geographical_rules] ${eligible.length} suppliers remain, ${removedIds.size} removed, ${issues.length} soft issue(s), ${policy_violations.length} policy evaluation(s)`);

  const result: NodeResult & {
    eligible_suppliers: EligibleSupplier[];
    suppliers_excluded: { supplier_id: string; supplier_name: string; reason: string }[];
  } = {
    issues,
    escalations,
    reasonings,
    policy_violations,
    eligible_suppliers: eligible,
    suppliers_excluded: new_excluded,
  };
  return NextResponse.json(result);
}
