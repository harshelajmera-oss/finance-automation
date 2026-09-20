import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MatchUtrClient from "./match-utr-client";

export default async function MatchUtrPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Match UTRs from a bank statement</h1>
      <p className="mb-6 text-sm text-slate-500">
        Upload the bank&apos;s payment status file or statement for the period covering your recent
        payments. Each row is matched to a payment still missing its UTR by amount and beneficiary
        account — review the matches below before confirming; nothing is saved until you do.
      </p>
      <MatchUtrClient />
    </main>
  );
}
