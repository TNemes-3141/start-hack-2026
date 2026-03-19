import { createRequestData, mergeRequestData, type RequestData, type RequestDataPatch, type RequestInterpretation } from "@/lib/request-data";
import { translateCall, internalCoherenceCall, missingRequiredDataCall, checkAvailableProductsCall, inappropriateRequestsCall, precedenceLookupCall, applyStaticCategoryRulesCall, approvalTierCall, purelyEligibleSuppliersCall, restrictedSuppliersCall, geographicalRulesCall, evaluatePreferredSupplierCall, applyDynamicCategoryRulesCall } from "@/lib/api-calls";

function hasBlocking(data: RequestData): boolean {
  return Object.values(data.stages).some(
    (stage) => stage.issues.some((i) => i.blocking) || stage.escalations.some((e) => e.blocking)
  );
}

export async function core_agent(
  uploadedJson: RequestInterpretation,
  onUpdate: (node: string, patch: RequestDataPatch) => void,
) {
  let currentData = createRequestData(uploadedJson);

  const interp = currentData.request_interpretation;

  function namedUpdate(node: string) {
    return (patch: RequestDataPatch) => {
      console.log(`[core_agent] ← ${node} returned`);
      currentData = mergeRequestData(currentData, patch);
      onUpdate(node, patch);
    };
  }

  function abort(after: string) {
    console.log(`[core_agent] pipeline aborted after ${after} — blocking issue or escalation detected`);
  }

  // ── Group 1 (parallel) ────────────────────────────────────────────────────
  // Branch A: translate
  // Branch B: internalCoherence → missingRequiredData → checkAvailableProducts (sequential)
  await Promise.all([
    translateCall(interp.request_text ?? "").then(namedUpdate("translation")),
    (async () => {
      await internalCoherenceCall(interp).then(namedUpdate("internal_coherence"));
      if (hasBlocking(currentData)) return;
      await missingRequiredDataCall(interp).then(namedUpdate("missing_required_data"));
      if (hasBlocking(currentData)) return;
      await checkAvailableProductsCall(interp).then(namedUpdate("check_available_products"));
    })(),
  ]);

  if (hasBlocking(currentData)) { abort("group 1"); return currentData; }

  // ── inappropriateRequests ─────────────────────────────────────────────────
  await inappropriateRequestsCall(interp).then(namedUpdate("inappropriate_requests"));
  if (hasBlocking(currentData)) { abort("inappropriate_requests"); return currentData; }

  // ── Group 2 (parallel) ────────────────────────────────────────────────────
  // Branch A: precedenceLookup → approvalTier (sequential)
  // Branch B: applyStaticCategoryRules
  await Promise.all([
    (async () => {
      await precedenceLookupCall(interp).then(namedUpdate("precedence_lookup"));
      if (hasBlocking(currentData)) return;
      await approvalTierCall(currentData).then(namedUpdate("approval_tier"));
    })(),
    applyStaticCategoryRulesCall(interp).then(namedUpdate("apply_category_rules")),
  ]);

  if (hasBlocking(currentData)) { abort("group 2"); return currentData; }

  // ── purelyEligibleSuppliers ───────────────────────────────────────────────
  await purelyEligibleSuppliersCall(currentData.request_interpretation).then(namedUpdate("purely_eligible_suppliers"));
  if (hasBlocking(currentData)) { abort("purely_eligible_suppliers"); return currentData; }

  // ── Group 3 (parallel) ────────────────────────────────────────────────────
  // Branch A: restrictedSuppliers → geographicalRules (sequential, both mutate eligible_suppliers)
  // Branch B: evaluatePreferredSupplier (independent — only produces reasoning/issues)
  await Promise.all([
    (async () => {
      await restrictedSuppliersCall(currentData).then(namedUpdate("restricted_suppliers"));
      if (hasBlocking(currentData)) return;
      await geographicalRulesCall(currentData).then(namedUpdate("geographical_rules"));
    })(),
    evaluatePreferredSupplierCall(currentData).then(namedUpdate("evaluate_preferred_supplier")),
  ]);

  if (hasBlocking(currentData)) { abort("group 3"); return currentData; }

  // ── applyDynamicCategoryRules ─────────────────────────────────────────────
  await applyDynamicCategoryRulesCall(currentData).then(namedUpdate("apply_dynamic_category_rules"));
  if (hasBlocking(currentData)) { abort("apply_dynamic_category_rules"); return currentData; }

  console.log("[core_agent] final RequestData:", JSON.stringify(currentData, null, 2));
  return currentData;
}
