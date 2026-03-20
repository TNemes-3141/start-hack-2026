Stage 8 — apply_dynamic_category_rules (static)
Input: count of remaining eligible suppliers, category_l1, category_l2, budget_amount, currency

Rules that depend on the number of available compliant suppliers:

CR-001: IT hardware > EUR 10,000 → minimum 2 supplier quotes. If fewer available: non-blocking issue
CR-003: Cloud services > EUR 50,000 → minimum 3 proposals. If fewer: non-blocking issue
CR-004: Data engineering > EUR 150,000 → minimum 3 proposals + technical evaluation note. If fewer: non-blocking issue
These are non-blocking because the system can still proceed with what is available, but the auditor needs to know the competitive comparison is constrained. Cross-reference against approval_tier.min_supplier_quotes as well — if the tier requires more quotes than suppliers available, that's separately noted.

Stage 9 — pricing_calculation (DB lookup)
Input: eligible_suppliers (post all filters), quantity, required_by_date, budget_amount, today's date

For each remaining supplier, fetch their pricing row matching: supplier_id, category_l1/l2, region (map delivery_countries to EU/Americas/APAC/MEA), currency, and the quantity tier (min_quantity ≤ quantity ≤ max_quantity), and current date within valid_from/valid_to.

For each supplier:

Compute total_cost = unit_price × quantity
Check total_cost ≤ budget_amount
Compute earliest_delivery = today + standard_lead_time_days. Compare to required_by_date
If lead time is too long: try expedited. Recompute total_cost with expedited_unit_price. Note the premium
If even expedited is too late: the supplier cannot meet deadline — add to suppliers_excluded with reason, note in reasoning
Check quantity ≤ capacity_per_month. If exceeded: ER-006 escalation (non-blocking — sourcing excellence lead can split order or negotiate). Do not remove supplier from list; flag it
If no pricing row exists for this supplier/region/tier: exclude with reason "No applicable pricing found"
Remove suppliers where no viable pricing path exists (over budget AND can't meet deadline). If 0 remain: ER-004.

Stage 10 — reevaluate_tier_from_quote (static)
Input: enriched supplier list with computed total_cost values, current approval_tier

For each supplier's total_cost, check whether it falls into a higher approval tier than the one determined from budget_amount in stage 5. Use the same threshold table.

If the highest total_cost crosses into a higher tier: ER-003 escalation (to Head of Strategic Sourcing), and update approval_tier in RequestData with llm_involved = false. Produce detailed reasoning noting the budget vs. actual quote discrepancy.

Stage 11 — scoring_and_ranking (static)
Input: enriched supplier list with pricing, scores, flags

Composite score as you outlined, with additions:

Price (40%): normalised inverse of total_cost among candidates
Quality (25%): normalise quality_score (0–100)
Risk (20%): normalised inverse of risk_score (lower is better)
ESG (15%, doubled to 30% if esg_requirement = true): normalise esg_score
When ESG is doubled, re-normalise the weights so they still sum to 100%
Preferred supplier bonus (+5 pts, tiebreaker): if preferred_supplier = true in DB (policy preferred)
Incumbent bonus (+2 pts): if supplier matches incumbent_supplier in request
Data residency compliance (+3 pts if data_residency_constraint = true and data_residency_supported = true)
Lead time compliance (−3 pts if only achievable via expedited; −8 pts if deadline cannot be met at all)
Produce ranked supplier_shortlist with all scoring criteria made explicit per supplier. Note which is the policy-preferred supplier, which is the requester's preferred supplier, and whether they coincide.

Stage 12 — final_report (LLM)
This is the only LLM stage in the back half of the pipeline. It receives the full RequestData and produces:

Recommendation: recommended supplier with rationale, or "unable to recommend — escalation required" with reasons
Preferred supplier verdict: a standalone paragraph explaining what happened to the requester's preferred supplier (drawing from evaluate_preferred_supplier reasoning)
Escalation summary: all active escalations consolidated with targets
Audit trail: policies_checked, supplier_ids_evaluated, data_sources_used, historical_awards_consulted
Confidence statement: express whether this is a clear recommendation or a contested decision