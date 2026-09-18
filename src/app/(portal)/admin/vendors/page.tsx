import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Vendor } from "@/lib/supabase/types";

export default async function AdminVendorsPage() {
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

  if (!currentProfile || !["admin", "checker"].includes(currentProfile.role)) {
    redirect("/dashboard");
  }

  const { data: vendors } = await supabase
    .from("vendors")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<Vendor[]>();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Vendors</h1>
      <p className="mb-6 text-sm text-slate-500">
        Created automatically the first time a maker submits a document for a vendor that doesn&apos;t
        match an existing one by GSTIN or PAN. New vendors need approval before their ledger and TDS
        defaults are treated as settled.
      </p>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">GSTIN / PAN</th>
              <th className="px-4 py-2 font-medium">Entity</th>
              <th className="px-4 py-2 font-medium">Default ledger</th>
              <th className="px-4 py-2 font-medium">Last TDS</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {(vendors ?? []).map((v) => (
              <tr key={v.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2 text-slate-900">
                  <Link href={`/admin/vendors/${v.id}`} className="underline hover:no-underline">
                    {v.name}
                  </Link>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-slate-500">
                  {v.gstin ?? v.pan ?? "—"}
                </td>
                <td className="px-4 py-2 text-slate-500">{v.entity_type ?? "—"}</td>
                <td className="px-4 py-2 text-slate-500">{v.default_expense_ledger ?? "—"}</td>
                <td className="px-4 py-2 text-slate-500">
                  {v.last_tds_code ? `${v.last_tds_code} (${v.last_tds_rate}%)` : "—"}
                </td>
                <td className="px-4 py-2">
                  {v.is_approved ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                      Approved
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Pending approval
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {(vendors ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  No vendors yet — they&apos;re created from the maker review screen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
