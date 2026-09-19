"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestBankChange, decideBankChange } from "../actions";
import type { Vendor, VendorBankChangeRequest } from "@/lib/supabase/types";

export default function BankChange({
  vendor,
  currentUserId,
  pendingRequest,
}: {
  vendor: Vendor;
  currentUserId: string;
  pendingRequest: VendorBankChangeRequest | null;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [bankAccount, setBankAccount] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submitRequest() {
    setError(null);
    startTransition(async () => {
      try {
        await requestBankChange(vendor.id, bankAccount, ifsc);
        setShowForm(false);
        setBankAccount("");
        setIfsc("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not submit the request.");
      }
    });
  }

  function decide(status: "confirmed" | "rejected") {
    if (!pendingRequest) return;
    setError(null);
    startTransition(async () => {
      try {
        await decideBankChange(pendingRequest.id, status);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not record your decision.");
      }
    });
  }

  const isOwnRequest = pendingRequest?.requested_by === currentUserId;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
      <h2 className="mb-1 text-sm font-semibold text-amber-900">Bank details</h2>
      <p className="mb-3 text-sm text-amber-800">
        Current: {vendor.bank_account ?? "—"} / {vendor.ifsc ?? "—"}. Changing these needs a second person&apos;s
        confirmation — the most common payment-fraud route, per the spec.
      </p>

      {pendingRequest ? (
        <div className="rounded-md border border-amber-300 bg-white p-3">
          <p className="text-sm text-slate-700">
            Pending change: <span className="font-medium">{pendingRequest.proposed_bank_account ?? "—"}</span> /{" "}
            <span className="font-medium">{pendingRequest.proposed_ifsc ?? "—"}</span>
          </p>
          {isOwnRequest ? (
            <p className="mt-2 text-sm text-amber-700">
              You requested this — someone else needs to confirm it.
            </p>
          ) : (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => decide("confirmed")}
                disabled={isPending}
                className="rounded-md bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
              >
                Confirm change
              </button>
              <button
                type="button"
                onClick={() => decide("rejected")}
                disabled={isPending}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      ) : showForm ? (
        <div className="space-y-2 rounded-md border border-amber-300 bg-white p-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500">New bank account</label>
            <input
              type="text"
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">New IFSC</label>
            <input
              type="text"
              value={ifsc}
              onChange={(e) => setIfsc(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submitRequest}
              disabled={isPending}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {isPending ? "Submitting…" : "Submit for confirmation"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm text-amber-900 hover:bg-amber-100"
        >
          Propose a change
        </button>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
