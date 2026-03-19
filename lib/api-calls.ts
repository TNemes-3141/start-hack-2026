import type { RequestData } from "./request-data";

/** Generic POST to any internal API endpoint. Returns a partial RequestData patch. */
export async function callApi(endpoint: string, input: unknown): Promise<Partial<RequestData>> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json();
}

/** Run multiple API calls in parallel. Calls onUpdate as each one resolves. Resolves when all are done. */
export async function callApiParallel(
  calls: Promise<Partial<RequestData>>[],
  onUpdate: (patch: Partial<RequestData>) => void,
): Promise<void> {
  await Promise.all(calls.map((p) => p.then(onUpdate)));
}

// --- Named API call wrappers (add more here as pipeline grows) ---

export const genericCall = (input: unknown) => callApi("/api/generic", input);
