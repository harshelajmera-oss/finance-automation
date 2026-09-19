"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runExtraction } from "../actions";
import ManualEntryForm from "./manual-entry-form";

export default function ExtractButton({
  documentId,
  defaultManual = false,
  hasFile = true,
}: {
  documentId: string;
  defaultManual?: boolean;
  hasFile?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(defaultManual || !hasFile);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        await runExtraction(documentId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Extraction failed.");
      }
    });
  }

  if (showManual) {
    return <ManualEntryForm documentId={documentId} onCancel={hasFile ? () => setShowManual(false) : undefined} />;
  }

  return (
    <div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleClick}
          disabled={isPending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {isPending ? "Reading document…" : "Extract fields"}
        </button>
        <button
          type="button"
          onClick={() => setShowManual(true)}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Enter details manually
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
