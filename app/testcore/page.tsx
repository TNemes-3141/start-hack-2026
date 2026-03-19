"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createRequestData, mergeRequestData, type RequestData, type RequestInterpretation } from "@/lib/request-data";
import { translateCall, internalCoherenceCall, missingRequiredDataCall, checkAvailableProductsCall } from "@/lib/api-calls";

async function core_agent(
  uploadedJson: RequestInterpretation,
  onUpdate: (patch: Partial<RequestData>) => void,
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
      onUpdate(patch);
    };
  }

  // --- Parallel: translate + internal coherence + missing data + product availability ---
  await Promise.all([
    translateCall(interp.request_text ?? "").then(namedUpdate("translate")),
    internalCoherenceCall(interp).then(namedUpdate("internal_coherence")),
    missingRequiredDataCall(interp).then(namedUpdate("missing_required_data")),
    checkAvailableProductsCall(interp).then(namedUpdate("check_available_products")),
  ]);

  // --- Next sequential step goes here ---
}

export default function TestCorePage() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadedJson, setUploadedJson] = useState<RequestInterpretation | null>(null);
  const [requestData, setRequestData] = useState<RequestData>(createRequestData());

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        setUploadedJson(JSON.parse(ev.target?.result as string));
      } catch {
        setUploadedJson(null);
      }
    };
    reader.readAsText(file);
  }

  function handleUpdate(patch: Partial<RequestData>) {
    console.log("[node update] patch received:", patch);
    setRequestData((prev) => {
      const next = mergeRequestData(prev, patch);
      console.log("[node update] request_data after merge:", next);
      return next;
    });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-16">
      <div className="flex flex-col items-center gap-3">
        <label
          htmlFor="json-upload"
          className="cursor-pointer rounded-lg border-2 border-dashed border-zinc-300 px-10 py-8 text-center text-zinc-500 transition hover:border-zinc-500 hover:text-zinc-700 dark:border-zinc-700 dark:hover:border-zinc-400"
        >
          <span className="block text-sm font-medium">
            {fileName ? fileName : "Click to upload JSON"}
          </span>
        </label>
        <input
          id="json-upload"
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      <Button
        onClick={() => {
          const initial = createRequestData(uploadedJson ?? undefined);
          setRequestData(initial);
          core_agent(uploadedJson ?? {}, handleUpdate);
        }}
      >
        Run core_agent
      </Button>
    </div>
  );
}
