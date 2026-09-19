import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Client, Profile } from "@/lib/supabase/types";
import AddClientForm from "./add-client-form";

export default async function AdminClientsPage() {
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

  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: true })
    .returns<Client[]>();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Clients</h1>
      <p className="mb-6 text-sm text-slate-500">
        The firm&apos;s own clients, whose payables this portal manages. Every uploaded document
        belongs to one of these.
      </p>

      <div className="mb-8 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Code</th>
              <th className="px-4 py-2 font-medium">GSTIN</th>
            </tr>
          </thead>
          <tbody>
            {(clients ?? []).map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2 text-slate-900">
                  <Link href={`/admin/clients/${c.id}`} className="underline hover:no-underline">
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-2 font-mono text-slate-900">{c.code}</td>
                <td className="px-4 py-2 text-slate-500">{c.gstin ?? "—"}</td>
              </tr>
            ))}
            {(clients ?? []).length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                  No clients yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 text-base font-semibold text-slate-900">Add a client</h2>
      <AddClientForm />
    </main>
  );
}
