import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchVendorsForLedgerExport } from "@/lib/tally/data";
import type { Profile } from "@/lib/supabase/types";
import LedgerExportTable from "./ledger-export-table";

export default async function TallyLedgersPage({ searchParams }: { searchParams: Promise<{ showAll?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single<Pick<Profile, "role">>();
  const isAdmin = profile?.role === "admin";

  const params = await searchParams;
  const showAll = isAdmin && params.showAll === "1";

  const allVendors = await fetchVendorsForLedgerExport(supabase);
  const vendors = showAll ? allVendors : allVendors.filter((v) => !v.tallyExportedAt);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Tally: new vendor ledgers</h1>
      <p className="mb-6 text-sm text-slate-500">
        Approved vendors, as ledger-creation XML for TallyPrime (Sundry Creditors). Import this into a
        <strong> test/backup company first</strong> and check it before ever importing into live books
        — this hasn&apos;t been tried against a real TallyPrime instance.
      </p>
      <LedgerExportTable vendors={vendors} isAdmin={isAdmin} showAll={showAll} />
    </main>
  );
}
