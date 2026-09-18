import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, TdsCode } from "@/lib/supabase/types";
import AddTdsCodeForm from "./add-tds-code-form";

export default async function AdminTdsCodesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  if (currentProfile?.role !== "admin") {
    redirect("/dashboard");
  }

  const { data: codes } = await supabase
    .from("tds_codes")
    .select("*")
    .order("code", { ascending: true })
    .returns<TdsCode[]>();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">TDS codes</h1>
      <p className="mb-6 text-sm text-slate-500">
        The rate table isn&apos;t fully settled yet in your spec — add codes as you decide them.
        Whatever a maker last used for a vendor becomes that vendor&apos;s new default automatically.
      </p>

      <div className="mb-8 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Code</th>
              <th className="px-4 py-2 font-medium">Description</th>
              <th className="px-4 py-2 font-medium">Rate</th>
              <th className="px-4 py-2 font-medium">Tally ledger</th>
            </tr>
          </thead>
          <tbody>
            {(codes ?? []).map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2 font-mono text-slate-900">{c.code}</td>
                <td className="px-4 py-2 text-slate-900">{c.description}</td>
                <td className="px-4 py-2 text-slate-900">{c.default_rate}%</td>
                <td className="px-4 py-2 text-slate-500">{c.tally_ledger_name ?? "—"}</td>
              </tr>
            ))}
            {(codes ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  No TDS codes yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 text-base font-semibold text-slate-900">Add a code</h2>
      <AddTdsCodeForm />
    </main>
  );
}
