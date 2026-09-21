import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchExpenseLedgers } from "@/lib/expense-ledgers/data";
import type { Client } from "@/lib/supabase/types";
import ExpenseLedgerManager from "./expense-ledger-manager";

export default async function ExpenseLedgersPage({ searchParams }: { searchParams: Promise<{ clientId?: string; showAll?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const { data: clients } = await supabase.from("clients").select("*").order("name", { ascending: true }).returns<Client[]>();
  const clientId = params.clientId || clients?.[0]?.id || "";
  const showAll = params.showAll === "1";

  const ledgers = clientId ? await fetchExpenseLedgers(supabase, clientId, { includeInactive: showAll }) : [];

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Expense Ledger Master</h1>
      <p className="mb-6 text-sm text-slate-500">
        Kept separately per client. This list feeds the Expense Ledger dropdown used when recording a
        document&apos;s expense category, in the review screens and grids, and in the Tally purchase
        voucher export. Maker, checker and admin can all add, amend or archive entries.
      </p>
      <ExpenseLedgerManager clients={clients ?? []} clientId={clientId} ledgers={ledgers} showAll={showAll} />
    </main>
  );
}
