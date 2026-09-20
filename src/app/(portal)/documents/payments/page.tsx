import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchPaymentHistory } from "@/lib/extraction/payments";
import { formatDate, formatNumber } from "@/lib/format";

const MODE_LABELS: Record<string, string> = {
  neft: "NEFT",
  rtgs: "RTGS",
  imps: "IMPS",
  upi: "UPI",
  card: "Card",
  auto_debit: "Auto-debit",
  employee_paid: "Employee-paid",
};

export default async function PaymentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const payments = await fetchPaymentHistory(supabase);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Payments</h1>
      <p className="mb-6 text-sm text-slate-500">
        Every payment recorded against an approved item — go to the{" "}
        <Link href="/documents/approved" className="underline hover:text-slate-900">
          Approved
        </Link>{" "}
        page, select the rows a payment covers, and record it from there.
      </p>

      <div className="space-y-4">
        {payments.map((p) => (
          <div key={p.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="font-medium text-slate-900">{formatDate(p.paymentDate)}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                {MODE_LABELS[p.mode] ?? p.mode}
              </span>
              {p.isAdvance && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Advance</span>
              )}
              {p.utr && <span className="text-slate-500">UTR {p.utr}</span>}
              {p.reference && <span className="text-slate-500">Ref {p.reference}</span>}
              {p.paidFromLedger && <span className="text-slate-500">from {p.paidFromLedger}</span>}
              {p.proofUrl && (
                <a href={p.proofUrl} target="_blank" rel="noreferrer" className="text-slate-500 underline hover:text-slate-900">
                  Proof
                </a>
              )}
              <span className="ml-auto text-right font-semibold text-slate-900">
                Net {formatNumber(p.netAmount)} (Gross {formatNumber(p.grossAmount)}, TDS {formatNumber(p.tdsAmount)})
              </span>
            </div>
            {p.notes && <p className="mb-2 text-sm text-slate-500">{p.notes}</p>}
            <table className="w-full text-left text-sm">
              <thead className="text-slate-400">
                <tr>
                  <th className="py-1 font-medium">Client</th>
                  <th className="py-1 font-medium">Vendor</th>
                  <th className="py-1 font-medium">Invoice</th>
                  <th className="py-1 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {p.lines.map((line) => (
                  <tr key={line.reviewId} className="border-t border-slate-100">
                    <td className="py-1 text-slate-700">{line.clientName}</td>
                    <td className="py-1 text-slate-700">{line.vendorName}</td>
                    <td className="py-1 text-slate-700">{line.invoiceNumber ?? "—"}</td>
                    <td className="py-1 text-right text-slate-900">{formatNumber(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {payments.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-slate-400">
            No payments recorded yet.
          </p>
        )}
      </div>
    </main>
  );
}
