"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitManualExtraction } from "../actions";
import { DocumentVendorFields, AmountsNotesFields } from "./field-editors";
import { emptyExtractedFields } from "@/lib/extraction/schema";
import type { ExtractedFields } from "@/lib/extraction/schema";

export default function ManualEntryForm({
  documentId,
  onCancel,
}: {
  documentId: string;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [fields, setFields] = useState<ExtractedFields>(emptyExtractedFields());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        await submitManualExtraction(documentId, fields);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save these details.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Type in what&apos;s on the document. This goes through the same automatic checks and review
        process as an AI-read document — it&apos;s just recorded as manually entered.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <DocumentVendorFields fields={fields} setFields={setFields} />
        </div>
        <div className="space-y-4">
          <AmountsNotesFields fields={fields} setFields={setFields} />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save details"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
