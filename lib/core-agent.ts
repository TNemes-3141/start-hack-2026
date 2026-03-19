import { createRequestData, mergeRequestData, type RequestDataPatch, type RequestInterpretation } from "@/lib/request-data";
import { translateCall, internalCoherenceCall, missingRequiredDataCall, checkAvailableProductsCall, inappropriateRequestsCall, precedenceLookupCall } from "@/lib/api-calls";

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

  // --- Parallel: translate + internal coherence + missing data + product availability + inappropriate check + precedence ---
  await Promise.all([
    translateCall(interp.request_text ?? "").then(namedUpdate("translation")),
    internalCoherenceCall(interp).then(namedUpdate("internal_coherence")),
    missingRequiredDataCall(interp).then(namedUpdate("missing_required_data")),
    checkAvailableProductsCall(interp).then(namedUpdate("check_available_products")),
    inappropriateRequestsCall(interp).then(namedUpdate("inappropriate_requests")),
    precedenceLookupCall(interp).then(namedUpdate("precedence_lookup")),
  ]);

  // --- Next sequential step goes here ---

  console.log("[core_agent] final RequestData:", JSON.stringify(currentData, null, 2));
}
