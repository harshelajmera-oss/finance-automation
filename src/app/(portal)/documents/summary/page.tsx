import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchExtractionSummaryRows } from "@/lib/extraction/summary";
import { formatDate, formatNumber } from "@/lib/format";

export default async function ExtractionSummaryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const rows = await fetchExtractionSummaryRows(supabase);

  const totals = rows.reduce(
    (acc, r) => ({
      taxableValue: acc.taxableValue + (r.taxableValue ?? 0),
      cgst: acc.cgst + (r.cgst ?? 0),
      sgst: acc.sgst + (r.sgst ?? 0),
      igst: acc.igst + (r.igst ?? 0),
      total: acc.total + (r.total ?? 0),
      tdsAmount: acc.tdsAmount + (r.tdsAmount ?? 0),
      netPayable: acc.netPayable + (r.netPayable ?? 0),
    }),
    { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, total: 0, tdsAmount: 0, netPayable: 0 },
  );

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <Link href="/documents" className="text-sm text-slate-500 hover:underline">
        ← All documents
      </Link>
      <div className="mt-2 mb-1 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Extraction summary</h1>
        {/* A real file download, not a page — Link would try to client-route it. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/documents/summary/export"
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Download as Excel
        </a>
      </div>
      <p className="mb-6 text-sm text-slate-500">
        One row per document, from its latest extraction. This is a working summary for reviewing
        what&apos;s been read so far — the real purchase register (Google Sheets) comes later in
        the build.
      </p>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Received</th>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Vendor</th>
              <th className="px-3 py-2 font-medium">Vendor GSTIN</th>
              <th className="px-3 py-2 font-medium">Invoice No</th>
              <th className="px-3 py-2 font-medium">Invoice Date</th>
              <th className="px-3 py-2 text-right font-medium">Taxable</th>
              <th className="px-3 py-2 text-right font-medium">CGST</th>
              <th className="px-3 py-2 text-right font-medium">SGST</th>
              <th className="px-3 py-2 text-right font-medium">IGST</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2 text-right font-medium">TDS</th>
              <th className="px-3 py-2 text-right font-medium">Net payable</th>
              <th className="px-3 py-2 font-medium">Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.documentId} className="border-b border-slate-100 last:border-0">
                <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                  {r.receivedAt ? formatDate(r.receivedAt) : "—"}
                </td>
                <td className="px-3 py-2 text-slate-900">
                  {r.clientName} ({r.clientCode})
                </td>
                <td className="px-3 py-2 text-slate-900">
                  <Link href={`/documents/${r.documentId}`} className="underline hover:no-underline">
                    {r.vendorName ?? r.fileName}
                  </Link>
                </td>
                <td className="px-3 py-2 text-slate-900">{r.vendorGstin ?? "—"}</td>
                <td className="px-3 py-2 text-slate-900">{r.invoiceNumber ?? "—"}</td>
                <td className="px-3 py-2 text-slate-900">{r.invoiceDate ?? "—"}</td>
                <td className="px-3 py-2 text-right text-slate-900">
                  {r.taxableValue !== null ? formatNumber(r.taxableValue) : "—"}
                </td>
                <td className="px-3 py-2 text-right text-slate-900">{r.cgst !== null ? formatNumber(r.cgst) : "—"}</td>
                <td className="px-3 py-2 text-right text-slate-900">{r.sgst !== null ? formatNumber(r.sgst) : "—"}</td>
                <td className="px-3 py-2 text-right text-slate-900">{r.igst !== null ? formatNumber(r.igst) : "—"}</td>
                <td className="px-3 py-2 text-right text-slate-900">{r.total !== null ? formatNumber(r.total) : "—"}</td>
                <td className="px-3 py-2 text-right text-slate-900">{r.tdsAmount !== null ? formatNumber(r.tdsAmount) : "—"}</td>
                <td className="px-3 py-2 text-right font-medium text-slate-900">
                  {r.netPayable !== null ? formatNumber(r.netPayable) : "—"}
                </td>
                <td className="px-3 py-2">
                  {r.flagCount > 0 ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      {r.flagCount}
                    </span>
                  ) : (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                      0
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={14} className="px-3 py-6 text-center text-slate-400">
                  Nothing extracted yet.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-300 font-medium text-slate-900">
                <td className="px-3 py-2" colSpan={6}>
                  Total
                </td>
                <td className="px-3 py-2 text-right">{formatNumber(totals.taxableValue)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(totals.cgst)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(totals.sgst)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(totals.igst)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(totals.total)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(totals.tdsAmount)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(totals.netPayable)}</td>
                <td className="px-3 py-2"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </main>
  );
}
