import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchReviewsForVoucherExport, voucherHoldReason } from "@/lib/tally/data";
import type { Profile } from "@/lib/supabase/types";
import VoucherExportTable from "./voucher-export-table";

export default async function TallyVouchersPage({ searchParams }: { searchParams: Promise<{ showAll?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single<Pick<Profile, "role">>();
  const isAdmin = profile?.role === "admin";

  const params = await searchParams;
  const showAll = isAdmin && params.showAll === "1";

  const allRows = await fetchReviewsForVoucherExport(supabase);
  const rows = showAll ? allRows : allRows.filter((r) => !r.tallyExportedAt);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Tally: purchase / journal vouchers</h1>
      <p className="mb-6 text-sm text-slate-500">
        One journal voucher per approved invoice: expense, GST input (FY-wise), TDS and vendor lines.
        Import the <strong>ledger-creation XML for these vendors first</strong> if you haven&apos;t
        already — this voucher import will fail on any ledger name Tally doesn&apos;t already have. Try
        it on a <strong>test/backup company first</strong>, never straight into live books — this
        hasn&apos;t been tried against a real TallyPrime instance.
      </p>
      <VoucherExportTable rows={rows} holdReasons={Object.fromEntries(rows.map((r) => [r.reviewId, voucherHoldReason(r)]))} isAdmin={isAdmin} showAll={showAll} />
    </main>
  );
}
