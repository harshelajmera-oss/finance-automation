"use client";

import { useTransition } from "react";
import { getDocumentViewUrl } from "./actions";

export default function ViewDocumentButton({ documentId }: { documentId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        const url = await getDocumentViewUrl(documentId);
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not open that file.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-sm text-slate-600 underline hover:text-slate-900 disabled:opacity-50"
    >
      {isPending ? "Opening…" : "View"}
    </button>
  );
}
