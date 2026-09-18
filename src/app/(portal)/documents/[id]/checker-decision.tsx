"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideReview } from "../actions";

export default function CheckerDecision({
  reviewId,
  vendorPendingId,
}: {
  reviewId: string;
  vendorPendingId: string | null;
}) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [approveVendor, setApproveVendor] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function decide(status: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      try {
        await decideReview(reviewId, status, comment, status === "approved" && approveVendor ? vendorPendingId : null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not record your decision.");
      }
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold text-slate-900">Your decision</h2>

      {vendorPendingId && (
        <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={approveVendor} onChange={(e) => setApproveVendor(e.target.checked)} />
          Also approve the new vendor
        </label>
      )}

      <label className="mb-1 block text-sm font-medium text-slate-700">
        Comment {"("}required to reject{")"}
      </label>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        className="mb-3 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => decide("approved")}
          disabled={isPending}
          className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => decide("rejected")}
          disabled={isPending}
          className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
