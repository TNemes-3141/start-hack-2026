import { createRequestData, mergeRequestData, type RequestData, type RequestDataPatch, type RequestInterpretation } from "@/lib/request-data";
import { translateCall, internalCoherenceCall, missingRequiredDataCall, checkAvailableProductsCall, inappropriateRequestsCall, precedenceLookupCall, applyStaticCategoryRulesCall, approvalTierCall, purelyEligibleSuppliersCall, restrictedSuppliersCall, geographicalRulesCall, evaluatePreferredSupplierCall, applyDynamicCategoryRulesCall, pricingCalculationCall, reevaluateTierCall, scoringAndRankingCall, finalCheckCall } from "@/lib/api-calls";

function hasBlocking(data: RequestData): boolean {
  return Object.values(data.stages).some(
    (stage) => stage.issues.some((i) => i.blocking) || stage.escalations.some((e) => e.blocking)
  );
}

export async function core_agent(
  uploadedJson: RequestInterpretation,
  onUpdate: (node: string, patch: RequestDataPatch) => void,
  options?: {
    skipBlockingChecks?: boolean;
    resumeFrom?: { data: RequestData; completedStages: Set<string> };
  },
) {
  // When resuming, start from the existing data so downstream stages have correct inputs.
  let currentData = options?.resumeFrom?.data ?? createRequestData(uploadedJson);

  const interp = currentData.request_interpretation;

  function namedUpdate(node: string) {
    return (patch: RequestDataPatch) => {
      console.log(`[core_agent] ← ${node} returned`);
      currentData = mergeRequestData(currentData, patch);
      onUpdate(node, patch);
    };
  }

  // If a stage was already completed in a prior run, signal the graph without hitting the API.
  async function runStage(nodeName: string, makeCall: () => Promise<RequestDataPatch>): Promise<void> {
    if (options?.resumeFrom?.completedStages.has(nodeName)) {
      console.log(`[core_agent] ↷ ${nodeName} skipped (already completed)`);
      namedUpdate(nodeName)({});
      return;
    }
    await makeCall().then(namedUpdate(nodeName));
  }

  function shouldAbort(): boolean {
    if (options?.skipBlockingChecks) return false;
    return hasBlocking(currentData);
  }

  function abort(after: string) {
    console.log(`[core_agent] pipeline aborted after ${after} — blocking issue or escalation detected`);
  }

  // ── Group 1 (parallel) ────────────────────────────────────────────────────
  // Branch A: translate
  // Branch B: internalCoherence → missingRequiredData → checkAvailableProducts (sequential)
  await Promise.all([
    runStage("translation", () => translateCall(interp.request_text ?? "")),
    (async () => {
      await runStage("internal_coherence", () => internalCoherenceCall(interp));
      if (shouldAbort()) return;
      await runStage("missing_required_data", () => missingRequiredDataCall(interp));
      if (shouldAbort()) return;
      await runStage("check_available_products", () => checkAvailableProductsCall(interp));
    })(),
  ]);

  if (shouldAbort()) { abort("group 1"); return currentData; }

  // ── inappropriateRequests ─────────────────────────────────────────────────
  await runStage("inappropriate_requests", () => inappropriateRequestsCall(interp));
  if (shouldAbort()) { abort("inappropriate_requests"); return currentData; }

  // ── Group 2 (parallel) ────────────────────────────────────────────────────
  // Branch A: precedenceLookup → approvalTier (sequential)
  // Branch B: applyStaticCategoryRules
  await Promise.all([
    (async () => {
      await runStage("precedence_lookup", () => precedenceLookupCall(interp));
      if (shouldAbort()) return;
      await runStage("approval_tier", () => approvalTierCall(currentData));
    })(),
    runStage("apply_category_rules", () => applyStaticCategoryRulesCall(interp)),
  ]);

  if (shouldAbort()) { abort("group 2"); return currentData; }

  // ── purelyEligibleSuppliers ───────────────────────────────────────────────
  await runStage("purely_eligible_suppliers", () => purelyEligibleSuppliersCall(currentData.request_interpretation));
  if (shouldAbort()) { abort("purely_eligible_suppliers"); return currentData; }

  // ── Group 3 (parallel) ────────────────────────────────────────────────────
  // Branch A: restrictedSuppliers → geographicalRules (sequential, both mutate eligible_suppliers)
  // Branch B: evaluatePreferredSupplier (independent — only produces reasoning/issues)
  await Promise.all([
    (async () => {
      await runStage("restricted_suppliers", () => restrictedSuppliersCall(currentData));
      if (shouldAbort()) return;
      await runStage("geographical_rules", () => geographicalRulesCall(currentData));
    })(),
    runStage("evaluate_preferred_supplier", () => evaluatePreferredSupplierCall(currentData)),
  ]);

  if (shouldAbort()) { abort("group 3"); return currentData; }

  // ── applyDynamicCategoryRules ─────────────────────────────────────────────
  await runStage("apply_dynamic_category_rules", () => applyDynamicCategoryRulesCall(currentData));
  if (shouldAbort()) { abort("apply_dynamic_category_rules"); return currentData; }

  // ── pricingCalculation ────────────────────────────────────────────────────
  await runStage("pricing_calculation", () => pricingCalculationCall(currentData));
  if (shouldAbort()) { abort("pricing_calculation"); return currentData; }

  // ── reevaluateTier ────────────────────────────────────────────────────────
  await runStage("reevaluate_tier_from_quote", () => reevaluateTierCall(currentData));
  if (shouldAbort()) { abort("reevaluate_tier_from_quote"); return currentData; }

  // ── scoringAndRanking ─────────────────────────────────────────────────────
  await runStage("scoring_and_ranking", () => scoringAndRankingCall(currentData));
  if (shouldAbort()) { abort("scoring_and_ranking"); return currentData; }

  // ── finalCheck ────────────────────────────────────────────────────────────
  await runStage("final_check", () => finalCheckCall(currentData));

  console.log("[core_agent] final RequestData:", JSON.stringify(currentData, null, 2));
  return currentData;
}
