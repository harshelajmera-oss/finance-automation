import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchPaymentHistory } from "@/lib/extraction/payments";
import PaymentCard from "./payment-card";

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

      <div className="mb-6">
        <Link
          href="/documents/payments/match-utr"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Match UTRs from a bank statement
        </Link>
      </div>

      <div className="space-y-4">
        {payments.map((p) => (
          <PaymentCard key={p.id} payment={p} />
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
