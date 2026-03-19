import { NextRequest, NextResponse } from "next/server";
import type { EligibleSupplier, Escalation, Issue, NodeResult, PolicyEvaluation, Reasoning, RequestData } from "@/lib/request-data";

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const data = await req.json() as RequestData;
  const interp = data.request_interpretation;

  const category_l1   = (interp.category_l1  ?? "").trim();
  const category_l2   = (interp.category_l2  ?? "").trim();
  const budget_amount = interp.budget_amount  ?? 0;
  const currency      = (interp.currency     ?? "EUR").toUpperCase();
  const data_residency = interp.data_residency_constraint ?? false;

  let eligible = [...data.eligible_suppliers];

  const issues:            Issue[]            = [];
  const escalations:       Escalation[]       = [];
  const reasonings:        Reasoning[]        = [];
  const policy_violations: PolicyEvaluation[] = [];

  let step = 1;
  let esc  = 1;
  let iss  = 1;

  // ── CR-001: IT / Laptops — mandatory supplier comparison above 100K ───────
  // Rule: "At least three compliant supplier options must be compared above EUR/CHF 100000"
  if (category_l1 === "IT" && category_l2 === "Laptops") {
    const covered = currency === "EUR" || currency === "CHF";
    const threshold = 100_000;

    if (covered && budget_amount > threshold) {
      if (eligible.length < 3) {
        policy_violations.push({
          policy: "CR-001",
          description: `CR-001 violated: IT/Laptops budget ${budget_amount} ${currency} exceeds ${threshold} ${currency} but only ${eligible.length} compliant supplier(s) remain (minimum 3 required).`,
        });
        reasonings.push({
          step_id: `R-DCR-${String(step++).padStart(3, "0")}`,
          aspect:  "CR-001 — Mandatory Comparison (Insufficient Suppliers)",
          reasoning: `CR-001 requires at least 3 compliant supplier options for IT/Laptops above EUR/CHF 100,000. Budget is ${budget_amount} ${currency} and only ${eligible.length} eligible supplier(s) remain after prior filters. Procurement cannot proceed without sufficient competition.`,
        });
        issues.push({
          issue_id:    `ISS-DCR-${String(iss++).padStart(3, "0")}`,
          trigger:     `CR-001: only ${eligible.length} supplier(s) available for IT/Laptops above EUR/CHF 100,000 (minimum 3 required)`,
          escalate_to: "Head of Category",
          blocking:    true,
          severity:    "critical",
        });
      } else {
        policy_violations.push({
          policy: "CR-001",
          description: `CR-001 satisfied: ${eligible.length} compliant supplier(s) available for IT/Laptops above ${threshold} ${currency} (minimum 3 required).`,
        });
        reasonings.push({
          step_id: `R-DCR-${String(step++).padStart(3, "0")}`,
          aspect:  "CR-001 — Mandatory Comparison",
          reasoning: `CR-001 applies: IT/Laptops budget ${budget_amount} ${currency} exceeds ${threshold} ${currency}. ${eligible.length} eligible suppliers available — ≥3 requirement is met.`,
        });
      }
    } else {
      policy_violations.push({
        policy: "CR-001",
        description: `CR-001 evaluated: IT/Laptops. Budget ${budget_amount} ${currency} does not exceed EUR/CHF 100,000 — mandatory three-quote rule not triggered.`,
      });
      reasonings.push({
        step_id: `R-DCR-${String(step++).padStart(3, "0")}`,
        aspect:  "CR-001 — Mandatory Comparison",
        reasoning: `CR-001 applies to IT/Laptops above EUR/CHF 100,000. Budget ${budget_amount} ${currency} is below or at this threshold — standard approval rules apply; three-supplier comparison not mandatory.`,
      });
    }
  }

  // ── CR-003: IT / Break-Fix — fast-track below 75K ────────────────────────
  // Rule: "Break-fix pool replenishment below EUR/CHF 75000 may use fast-track approval with one quote"
  if (category_l1 === "IT" && category_l2 === "Replacement / Break-Fix Pool Devices") {
    const covered   = currency === "EUR" || currency === "CHF";
    const threshold = 75_000;

    if (covered && budget_amount < threshold) {
      policy_violations.push({
        policy: "CR-003",
        description: `CR-003 applies: IT/Break-Fix Pool Devices budget ${budget_amount} ${currency} is below EUR/CHF 75,000 — fast-track approval with a single quote is permitted.`,
      });
      reasonings.push({
        step_id: `R-DCR-${String(step++).padStart(3, "0")}`,
        aspect:  "CR-003 — Fast-Track Approval",
        reasoning: `CR-003 allows fast-track approval for IT/Break-Fix Pool Devices below EUR/CHF 75,000. Budget ${budget_amount} ${currency} qualifies. A single supplier quote is sufficient for this request.`,
      });
    } else {
      policy_violations.push({
        policy: "CR-003",
        description: `CR-003 evaluated: IT/Break-Fix Pool Devices. Budget ${budget_amount} ${currency} meets or exceeds EUR/CHF 75,000 — fast-track not available; standard competitive comparison required.`,
      });
      reasonings.push({
        step_id: `R-DCR-${String(step++).padStart(3, "0")}`,
        aspect:  "CR-003 — Fast-Track Approval",
        reasoning: `CR-003 fast-track is available for IT/Break-Fix Pool Devices below EUR/CHF 75,000. Budget ${budget_amount} ${currency} meets or exceeds this threshold — fast-track is not available; standard approval and competitive comparison rules apply.`,
      });
    }
  }

  // ── CR-004: IT / Cloud Compute — data residency filter ───────────────────
  // Rule: "Requests marked with data residency constraint must be evaluated only against suppliers supporting residency requirements"
  if (category_l1 === "IT" && category_l2 === "Cloud Compute") {
    if (data_residency) {
      const before  = eligible.length;
      eligible      = eligible.filter((s) => s.data_residency_supported === true);
      const removed = before - eligible.length;

      if (eligible.length === 0) {
        policy_violations.push({
          policy: "CR-004",
          description: `CR-004 violated: data_residency_constraint=true for IT/Cloud Compute. All ${before} supplier(s) were removed — none support data residency requirements.`,
        });
        reasonings.push({
          step_id: `R-DCR-${String(step++).padStart(3, "0")}`,
          aspect:  "CR-004 — Data Residency Check (No Compliant Suppliers)",
          reasoning: `CR-004 requires that Cloud Compute requests with data residency constraints be evaluated only against suppliers that support data residency. After filtering, 0 of ${before} supplier(s) remain. No compliant supplier can fulfil this request — pipeline blocked.`,
        });
        issues.push({
          issue_id:    `ISS-DCR-${String(iss++).padStart(3, "0")}`,
          trigger:     `CR-004: no Cloud Compute suppliers support the required data residency constraint`,
          escalate_to: "Head of Category",
          blocking:    true,
          severity:    "critical",
        });
        escalations.push({
          escalation_id: `ESC-DCR-${String(esc++).padStart(3, "0")}`,
          rule:          "ER-004",
          trigger:       `CR-004: after data residency filter, 0 of ${before} Cloud Compute supplier(s) remain — no compliant supplier can be identified`,
          escalate_to:   "Head of Category",
          blocking:      true,
        });
      } else {
        policy_violations.push({
          policy: "CR-004",
          description: `CR-004 satisfied: data_residency_constraint=true for IT/Cloud Compute. ${eligible.length} supplier(s) pass residency check${removed > 0 ? ` (${removed} removed for lacking data residency support)` : ""}.`,
        });
        reasonings.push({
          step_id: `R-DCR-${String(step++).padStart(3, "0")}`,
          aspect:  "CR-004 — Data Residency Check",
          reasoning: `CR-004 applies: IT/Cloud Compute with data_residency_constraint=true. Eligible list filtered to suppliers confirming data residency support. ${removed} supplier(s) removed; ${eligible.length} remain.`,
        });
      }
    } else {
      policy_violations.push({
        policy: "CR-004",
        description: `CR-004 evaluated: IT/Cloud Compute, data_residency_constraint=false. Data residency filter not applied — all ${eligible.length} supplier(s) remain eligible.`,
      });
      reasonings.push({
        step_id: `R-DCR-${String(step++).padStart(3, "0")}`,
        aspect:  "CR-004 — Data Residency Check",
        reasoning: `CR-004 applies to IT/Cloud Compute requests with data residency constraints. data_residency_constraint=false for this request — residency filter not applied.`,
      });
    }
  }

  // ── No applicable rules ───────────────────────────────────────────────────
  if (policy_violations.length === 0) {
    reasonings.push({
      step_id: `R-DCR-${String(step++).padStart(3, "0")}`,
      aspect:  "Dynamic Category Rules — Not Applicable",
      reasoning: `No dynamic category rules (CR-001, CR-003, CR-004) apply to (${category_l1} / ${category_l2}). All ${eligible.length} supplier(s) remain eligible.`,
    });
  }

  console.log(`[apply_dynamic_category_rules] (${category_l1} / ${category_l2}), ${eligible.length} supplier(s) remain, ${issues.length} issue(s), ${escalations.length} escalation(s)`);

  const result: NodeResult & { eligible_suppliers: EligibleSupplier[] } = {
    issues,
    escalations,
    reasonings,
    policy_violations,
    eligible_suppliers: eligible,
  };
  return NextResponse.json(result);
}
