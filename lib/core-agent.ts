import { createRequestData, mergeRequestData, type RequestData, type RequestInterpretation } from "@/lib/request-data";
import { translateCall, internalCoherenceCall, missingRequiredDataCall, checkAvailableProductsCall } from "@/lib/api-calls";

export async function core_agent(
  uploadedJson: RequestInterpretation,
  onUpdate: (node: string, patch: Partial<RequestData>) => void,
) {
  let currentData = createRequestData(uploadedJson);
  console.log("[core_agent] starting pipeline with:", currentData.request_interpretation);

  const interp = currentData.request_interpretation;

  function namedUpdate(node: string) {
    return (patch: Partial<RequestData>) => {
      console.group(`[${node}] finished`);
      console.log("patch:", patch);
      currentData = mergeRequestData(currentData, patch);
      console.log("request_data after merge:", currentData);
      console.groupEnd();
      onUpdate(node, patch);
    };
  }

  await Promise.all([
    translateCall(interp.request_text ?? "").then(namedUpdate("translate")),
    internalCoherenceCall(interp).then(namedUpdate("internal_coherence")),
    missingRequiredDataCall(interp).then(namedUpdate("missing_required_data")),
    checkAvailableProductsCall(interp).then(namedUpdate("check_available_products")),
  ]);
}
