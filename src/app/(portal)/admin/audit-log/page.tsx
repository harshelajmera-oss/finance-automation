import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AuditLogEntry, Profile } from "@/lib/supabase/types";
import { formatDateTime } from "@/lib/format";

export default async function AuditLogPage() {
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

  const { data: entries } = await supabase
    .from("audit_log")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(200)
    .returns<AuditLogEntry[]>();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Audit log</h1>
      <p className="mb-6 text-sm text-slate-500">
        Read-only. Entries cannot be edited or deleted, by anyone, including admins.
      </p>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 font-medium">Who</th>
              <th className="px-4 py-2 font-medium">Action</th>
              <th className="px-4 py-2 font-medium">Old value</th>
              <th className="px-4 py-2 font-medium">New value</th>
            </tr>
          </thead>
          <tbody>
            {(entries ?? []).map((e) => (
              <tr key={e.id} className="border-b border-slate-100 align-top last:border-0">
                <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                  {formatDateTime(e.occurred_at)}
                </td>
                <td className="px-4 py-2 text-slate-900">{e.actor_email ?? "—"}</td>
                <td className="px-4 py-2 text-slate-900">{e.action}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-500">
                  {e.old_value ? JSON.stringify(e.old_value) : "—"}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-slate-500">
                  {e.new_value ? JSON.stringify(e.new_value) : "—"}
                </td>
              </tr>
            ))}
            {(entries ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  No audit entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
