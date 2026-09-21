import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Client } from "@/lib/supabase/types";
import ImportLedgersClient from "./import-ledgers-client";

export default async function ImportLedgersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: clients } = await supabase.from("clients").select("*").order("name", { ascending: true }).returns<Client[]>();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Import ledgers from Tally</h1>
      <p className="mb-6 text-sm text-slate-500">
        A one-time way to seed the Vendor and Expense Ledger masters from Tally&apos;s own ledger list
        (Display → Statements of Accounts → List of Ledgers, exported to Excel). Upload the file, then
        tick the groups whose ledgers you want — for vendors, that&apos;s usually a sub-group like
        &quot;Domestic Parties&quot; under Sundry Creditors, not Sundry Creditors itself.
      </p>
      <ImportLedgersClient clients={clients ?? []} />
    </main>
  );
}
