import { NextRequest, NextResponse } from "next/server";
import type { Escalation, Issue, IssueSeverity, NodeResult, PolicyEvaluation, Reasoning } from "@/lib/request-data";

// ── Rule definitions ──────────────────────────────────────────────────────────

type ConditionalType =
  | { type: "always" }
  | { type: "quantity_above"; threshold: number }
  | { type: "budget_above"; threshold: number; currencies: string[] };

type RuleAction =
  | { kind: "issue"; severity: IssueSeverity; escalate_to: string }
  | { kind: "escalation"; escalate_to: string; er_rule: string };

type CategoryRule = {
  rule_id: string;
  category_l1: string;
  category_l2: string;
  rule_type: string;
  rule_text: string;
  condition: ConditionalType;
  action: RuleAction;
};

const CATEGORY_RULES: CategoryRule[] = [
  {
    rule_id: "CR-002",
    category_l1: "IT",
    category_l2: "Mobile Workstations",
    rule_type: "engineering_spec_review",
    rule_text: "Mobile workstation requests above 50 units require compatibility review with engineering or CAD lead.",
    condition: { type: "quantity_above", threshold: 50 },
    action: { kind: "issue", severity: "critical", escalate_to: "Engineering/CAD Lead" },
  },
  {
    rule_id: "CR-005",
    category_l1: "IT",
    category_l2: "Managed Cloud Platform Services",
    rule_type: "security_review",
    rule_text: "Managed platform requests above EUR/CHF 250,000 require security architecture review.",
    condition: { type: "budget_above", threshold: 250000, currencies: ["EUR", "CHF"] },
    action: { kind: "issue", severity: "critical", escalate_to: "Requester" },
  },
  {
    rule_id: "CR-006",
    category_l1: "Facilities",
    category_l2: "Reception and Lounge Furniture",
    rule_type: "design_signoff",
    rule_text: "Reception and lounge projects require business design sign-off before award.",
    condition: { type: "always" },
    action: { kind: "issue", severity: "critical", escalate_to: "Requester" },
  },
  {
    rule_id: "CR-007",
    category_l1: "Professional Services",
    category_l2: "Software Development Services",
    rule_type: "cv_review",
    rule_text: "Named consultant CVs or equivalent capability profiles are required above 60 consulting days.",
    condition: { type: "quantity_above", threshold: 60 },
    action: { kind: "issue", severity: "critical", escalate_to: "Requester" },
  },
  {
    rule_id: "CR-008",
    category_l1: "Professional Services",
    category_l2: "Cybersecurity Advisory",
    rule_type: "certification_check",
    rule_text: "Cybersecurity advisory suppliers must demonstrate relevant certifications or equivalent references.",
    condition: { type: "always" },
    action: { kind: "issue", severity: "critical", escalate_to: "Requester" },
  },
  {
    rule_id: "CR-009",
    category_l1: "Marketing",
    category_l2: "Search Engine Marketing (SEM)",
    rule_type: "performance_baseline",
    rule_text: "SEM proposals should include performance baseline or benchmark assumptions.",
    condition: { type: "always" },
    action: { kind: "issue", severity: "middle", escalate_to: "Requester" },
  },
  {
    rule_id: "CR-010",
    category_l1: "Marketing",
    category_l2: "Influencer Campaign Management",
    rule_type: "brand_safety",
    rule_text: "Influencer campaigns require brand-safety review before final award.",
    condition: { type: "always" },
    action: { kind: "escalation", escalate_to: "Marketing Governance Lead", er_rule: "ER-007" },
  },
];

function conditionMet(rule: CategoryRule, quantity: number | null, budget_amount: number | null, currency: string): boolean {
  const c = rule.condition;
  if (c.type === "always") return true;
  if (c.type === "quantity_above") return quantity !== null && quantity > c.threshold;
  if (c.type === "budget_above") return (
    budget_amount !== null &&
    budget_amount > c.threshold &&
    c.currencies.includes(currency.toUpperCase())
  );
  return false;
}

export async function POST(req: NextRequest) {
  const body = await req.json() as Record<string, unknown>;

  const category_l1   = (body["category_l1"]   ?? "") as string;
  const category_l2   = (body["category_l2"]   ?? "") as string;
  const currency      = (body["currency"]       ?? "") as string;
  const quantity      = typeof body["quantity"]      === "number" ? body["quantity"]      : null;
  const budget_amount = typeof body["budget_amount"] === "number" ? body["budget_amount"] : null;

  console.log(`[apply_static_category_rules] checking (${category_l1} / ${category_l2})`);

  const issues: Issue[] = [];
  const escalations: Escalation[] = [];
  const reasonings: Reasoning[] = [];
  const policy_violations: PolicyEvaluation[] = [];

  let issueIdx = 1;
  let escalationIdx = 1;
  let stepIdx = 1;

  const applicableRules = CATEGORY_RULES.filter(
    (r) => r.category_l1 === category_l1 && r.category_l2 === category_l2
  );

  if (applicableRules.length === 0) {
    reasonings.push({
      step_id: `R-CR-${String(stepIdx++).padStart(3, "0")}`,
      aspect: "Category Rules",
      reasoning: `No static category rules apply to (${category_l1} / ${category_l2}). Processing continues without restrictions.`,
    });
  }

  for (const rule of applicableRules) {
    const triggered = conditionMet(rule, quantity, budget_amount, currency);

    reasonings.push({
      step_id: `R-CR-${String(stepIdx++).padStart(3, "0")}`,
      aspect: `${rule.rule_id} — ${rule.rule_type}`,
      reasoning: triggered
        ? `Rule ${rule.rule_id} triggered for (${category_l1} / ${category_l2}): ${rule.rule_text}`
        : `Rule ${rule.rule_id} checked but condition not met (${
            rule.condition.type === "quantity_above"
              ? `quantity ${quantity ?? "n/a"} ≤ ${rule.condition.threshold}`
              : rule.condition.type === "budget_above"
              ? `budget ${budget_amount ?? "n/a"} ${currency} ≤ ${rule.condition.threshold} or currency not in scope`
              : "n/a"
          }). No action required.`,
    });

    if (!triggered) continue;

    policy_violations.push({
      policy: rule.rule_id,
      description: rule.rule_text,
    });

    if (rule.action.kind === "escalation") {
      escalations.push({
        escalation_id: `ESC-CR-${String(escalationIdx++).padStart(3, "0")}`,
        rule: rule.action.er_rule,
        trigger: `Category rule ${rule.rule_id} (${rule.rule_type}) triggered for ${category_l1} / ${category_l2}`,
        escalate_to: rule.action.escalate_to,
        blocking: false,
      });
    } else {
      issues.push({
        issue_id: `ISS-CR-${String(issueIdx++).padStart(3, "0")}`,
        trigger: `Category rule ${rule.rule_id} (${rule.rule_type}) triggered for ${category_l1} / ${category_l2}`,
        escalate_to: rule.action.escalate_to,
        blocking: false,
        severity: rule.action.severity,
      });
    }
  }

  console.log(
    `[apply_static_category_rules] ${applicableRules.length} rule(s) applicable, ` +
    `${issues.length} issue(s), ${escalations.length} escalation(s)`
  );

  const result: NodeResult = { issues, escalations, reasonings, policy_violations };
  return NextResponse.json(result);
}
