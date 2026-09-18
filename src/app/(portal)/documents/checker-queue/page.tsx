import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Client, Document, Profile, Review, Vendor } from "@/lib/supabase/types";

type ReviewRow = Review & {
  documents: (Pick<Document, "id" | "original_filename" | "received_at"> & {
    clients: Pick<Client, "name" | "code"> | null;
  }) | null;
  vendors: Pick<Vendor, "name" | "is_approved"> | null;
};

export default async function CheckerQueuePage() {
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

  if (currentProfile?.role !== "checker") {
    redirect("/dashboard");
  }

  const { data: reviews } = await supabase
    .from("reviews")
    .select("*, documents ( id, original_filename, received_at, clients ( name, code ) ), vendors ( name, is_approved )")
    .eq("status", "submitted")
    .order("submitted_at", { ascending: true })
    .returns<ReviewRow[]>();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Checker queue</h1>
      <p className="mb-6 text-sm text-slate-500">
        Everything waiting on your decision, oldest first. Open one to see what changed from the AI&apos;s
        original read, then approve or reject with a comment.
      </p>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Submitted</th>
              <th className="px-4 py-2 font-medium">Client</th>
              <th className="px-4 py-2 font-medium">File</th>
              <th className="px-4 py-2 font-medium">Vendor</th>
              <th className="px-4 py-2 font-medium">Flags overridden</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(reviews ?? []).map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                  {new Date(r.submitted_at).toLocaleString()}
                </td>
                <td className="px-4 py-2 text-slate-900">
                  {r.documents?.clients ? `${r.documents.clients.name} (${r.documents.clients.code})` : "—"}
                </td>
                <td className="px-4 py-2 text-slate-900">{r.documents?.original_filename ?? "—"}</td>
                <td className="px-4 py-2 text-slate-900">
                  {r.vendors?.name ?? "—"} {r.vendors && !r.vendors.is_approved && "(new)"}
                </td>
                <td className="px-4 py-2">
                  {r.override_reason ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Yes
                    </span>
                  ) : (
                    <span className="text-slate-400">No</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {r.documents && (
                    <Link href={`/documents/${r.documents.id}`} className="text-slate-900 underline hover:no-underline">
                      Review →
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {(reviews ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Nothing waiting on you right now.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
