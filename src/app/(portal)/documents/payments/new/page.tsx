import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchApprovedRows } from "@/lib/extraction/approved";
import { fetchPaidAmountsByReview, outstandingAmount } from "@/lib/extraction/payments";
import RecordPaymentForm, { type PayableRow } from "./record-payment-form";

export default async function NewPaymentPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const reviewIds = (params.ids ?? "").split(",").filter(Boolean);

  if (reviewIds.length === 0) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        <h1 className="mb-2 text-xl font-semibold text-slate-900">Record a payment</h1>
        <p className="text-sm text-slate-500">
          No items selected. Go to{" "}
          <Link href="/documents/approved" className="underline hover:text-slate-900">
            Approved
          </Link>{" "}
          and tick the rows this payment covers first.
        </p>
      </main>
    );
  }

  const [rows, paidByReview] = await Promise.all([
    fetchApprovedRows(supabase, { reviewIds }),
    fetchPaidAmountsByReview(supabase, reviewIds),
  ]);

  const payable: PayableRow[] = rows.map((row) => {
    const paidSoFar = paidByReview.get(row.reviewId) ?? 0;
    const outstanding = outstandingAmount(row, paidByReview);
    return {
      reviewId: row.reviewId,
      vendorName: row.vendorName,
      clientLabel: `${row.clientName} (${row.clientCode})`,
      invoiceNumber: row.invoiceNumber,
      invoiceDate: row.invoiceDate,
      total: row.total,
      tdsAmount: row.tdsAmount,
      paymentRoute: row.paymentRoute,
      paidSoFar,
      outstanding,
    };
  });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Record a payment</h1>
      <p className="mb-6 text-sm text-slate-500">
        One payment record can cover several invoices at once — enter what actually moved, then confirm the
        amount applied to each one below. A row already fully paid, or with nothing owing, is shown but can be
        left unticked.
      </p>
      <RecordPaymentForm rows={payable} />
    </main>
  );
}
