"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { uploadDocument } from "./actions";
import { getDocumentViewUrl } from "../actions";
import type { Client } from "@/lib/supabase/types";

export default function UploadForm({ clients }: { clients: Client[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastUploadedId, setLastUploadedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isViewPending, startViewTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLastUploadedId(null);

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const result = await uploadDocument(formData);
        formRef.current?.reset();
        setLastUploadedId(result.documentId);
        setMessage(
          result.isDuplicate
            ? "Uploaded — but this looks like an exact copy of a file already on file, so it's been flagged as a duplicate."
            : "Uploaded.",
        );
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not upload that file.");
      }
    });
  }

  function handleView() {
    if (!lastUploadedId) return;
    startViewTransition(async () => {
      try {
        const url = await getDocumentViewUrl(lastUploadedId);
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not open that file.");
      }
    });
  }

  if (clients.length === 0) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        No clients have been added yet. An admin needs to add a client under{" "}
        <span className="font-medium">Manage clients</span> before anything can be uploaded.
      </p>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div>
        <label htmlFor="clientId" className="mb-1 block text-sm font-medium text-slate-700">
          Client
        </label>
        <select
          id="clientId"
          name="clientId"
          required
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.code})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="file" className="mb-1 block text-sm font-medium text-slate-700">
          File
        </label>
        <input
          id="file"
          name="file"
          type="file"
          required
          accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm"
        />
        <p className="mt-1 text-xs text-slate-400">PDF, JPG, PNG, XLS or XLSX, up to 25 MB.</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && (
        <p className="text-sm text-green-600">
          {message}{" "}
          {lastUploadedId && (
            <button
              type="button"
              onClick={handleView}
              disabled={isViewPending}
              className="underline hover:text-green-800 disabled:opacity-50"
            >
              {isViewPending ? "Opening…" : "View it"}
            </button>
          )}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {isPending ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}
