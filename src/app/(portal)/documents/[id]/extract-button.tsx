"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runExtraction } from "../actions";

export default function ExtractButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
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

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {isPending ? "Reading document…" : "Extract fields"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
