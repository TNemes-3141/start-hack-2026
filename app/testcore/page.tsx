"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createRequestData, mergeRequestData, type RequestData } from "@/lib/request-data";
import { genericCall, callApiParallel } from "@/lib/api-calls";

async function core_agent(
  uploadedJson: unknown,
  onUpdate: (patch: Partial<RequestData>) => void,
) {
  console.log("Loaded JSON:", uploadedJson);

  // --- Sequential call ---
  const analysis = await genericCall(uploadedJson);
  onUpdate(analysis);

  // --- Parallel calls example (uncomment and add more as needed) ---
  // await callApiParallel([
  //   anotherCall(uploadedJson),
  //   yetAnotherCall(uploadedJson),
  // ], onUpdate);

  // --- Next sequential step goes here ---
}

export default function TestCorePage() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadedJson, setUploadedJson] = useState<unknown>(null);
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
    setRequestData((prev) => mergeRequestData(prev, patch));
    console.log(requestData)
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
          const initial = createRequestData(uploadedJson);
          setRequestData(initial);
          core_agent(uploadedJson, handleUpdate);
        }}
      >
        Run core_agent
      </Button>
    </div>
  );
}
