import { diffExtractedFields } from "@/lib/extraction/diff";
import type { ExtractedFields } from "@/lib/extraction/schema";
import type { Review, Vendor } from "@/lib/supabase/types";

const PAYMENT_ROUTE_LABELS: Record<Review["payment_route"], string> = {
  portal: "Pay via portal",
  card: "Already paid by card",
  employee: "Already paid by employee",
  auto_debit: "Auto-debit",
  pay_gross_recover: "Pay gross and recover TDS",
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return JSON.stringify(value);
  return String(value);
}

export default function ReviewSummary({
  aiFields,
  review,
  vendor,
}: {
  aiFields: ExtractedFields;
  review: Review;
  vendor: Vendor | null;
}) {
  const diffs = diffExtractedFields(aiFields, review.reviewed_fields);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">
          {diffs.length > 0 ? "Changes the maker made" : "No changes from what Claude read"}
        </h2>
        {diffs.length > 0 && (
          <ul className="space-y-1">
            {diffs.map((d) => (
              <li key={d.path} className="text-sm text-slate-700">
                <span className="font-mono text-xs text-slate-400">{d.path}</span>: {formatValue(d.aiValue)} →{" "}
                <span className="font-medium text-slate-900">{formatValue(d.makerValue)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Submission</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-slate-400">Vendor</dt>
            <dd className="text-slate-900">
              {vendor ? vendor.name : "—"} {vendor && !vendor.is_approved && "(pending approval)"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Expense ledger</dt>
            <dd className="text-slate-900">{review.expense_ledger ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">TDS</dt>
            <dd className="text-slate-900">
              {review.tds_code ? `${review.tds_code} @ ${review.tds_rate}%` : "—"}{" "}
              {review.tds_amount !== null && `(₹${review.tds_amount.toLocaleString()})`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Gross-up</dt>
            <dd className="text-slate-900">{review.gross_up ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Payment route</dt>
            <dd className="text-slate-900">{PAYMENT_ROUTE_LABELS[review.payment_route]}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Submitted</dt>
            <dd className="text-slate-900">{new Date(review.submitted_at).toLocaleString()}</dd>
          </div>
        </dl>
        {review.override_reason && (
          <p className="mt-3 rounded-md bg-amber-50 p-2 text-sm text-amber-800">
            Submitted despite open flags: {review.override_reason}
          </p>
        )}
      </div>

      {review.status !== "submitted" && (
        <div
          className={`rounded-lg border p-4 shadow-sm ${
            review.status === "approved" ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
          }`}
        >
          <p className={`text-sm font-medium ${review.status === "approved" ? "text-green-800" : "text-red-800"}`}>
            {review.status === "approved" ? "Approved" : "Rejected"}
            {review.decided_at && ` on ${new Date(review.decided_at).toLocaleString()}`}
          </p>
          {review.checker_comment && (
            <p className={`mt-1 text-sm ${review.status === "approved" ? "text-green-700" : "text-red-700"}`}>
              {review.checker_comment}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
