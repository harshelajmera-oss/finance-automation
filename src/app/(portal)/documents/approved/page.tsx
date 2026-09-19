import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchApprovedRows } from "@/lib/extraction/approved";

const PAYMENT_ROUTE_LABELS: Record<string, string> = {
  portal: "Pay via portal",
  card: "Already paid by card",
  employee: "Already paid by employee",
  auto_debit: "Auto-debit",
  pay_gross_recover: "Pay gross and recover TDS",
};

export default async function ApprovedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const rows = await fetchApprovedRows(supabase);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Approved</h1>
        {/* A real file download, not a page — Link would try to client-route it. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/documents/approved/export"
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Download as Excel
        </a>
      </div>
      <p className="mb-6 text-sm text-slate-500">
        Everything a checker has approved, visible to maker, checker and admin alike. This is the
        list to work from for payment — the actual payment batch is a later step.
      </p>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Approved</th>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Vendor</th>
              <th className="px-3 py-2 font-medium">Invoice</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2 text-right font-medium">TDS</th>
              <th className="px-3 py-2 text-right font-medium">Net payable</th>
              <th className="px-3 py-2 font-medium">Route</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.reviewId} className="border-b border-slate-100 last:border-0">
                <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                  {r.approvedAt ? new Date(r.approvedAt).toLocaleDateString() : "—"}
                </td>
                <td className="px-3 py-2 text-slate-900">
                  {r.clientName} ({r.clientCode})
                </td>
                <td className="px-3 py-2 text-slate-900">
                  <Link href={`/documents/${r.documentId}`} className="underline hover:no-underline">
                    {r.vendorName}
                  </Link>
                </td>
                <td className="px-3 py-2 text-slate-900">{r.invoiceNumber ?? "—"}</td>
                <td className="px-3 py-2 text-right text-slate-900">{r.total?.toLocaleString() ?? "—"}</td>
                <td className="px-3 py-2 text-right text-slate-900">{r.tdsAmount?.toLocaleString() ?? "—"}</td>
                <td className="px-3 py-2 text-right font-medium text-slate-900">
                  {r.netPayable?.toLocaleString() ?? "—"}
                </td>
                <td className="px-3 py-2 text-slate-500">{PAYMENT_ROUTE_LABELS[r.paymentRoute] ?? r.paymentRoute}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                  Nothing approved yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
