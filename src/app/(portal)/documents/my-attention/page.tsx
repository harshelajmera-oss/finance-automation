import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Client, Document, Profile, Review } from "@/lib/supabase/types";

type ReviewRow = Review & {
  documents: (Pick<Document, "id" | "original_filename" | "review_status"> & {
    clients: Pick<Client, "name" | "code"> | null;
  }) | null;
};

export default async function MyAttentionPage() {
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

  if (currentProfile?.role !== "maker") {
    redirect("/dashboard");
  }

  // Latest review per document, submitted by this maker, where the
  // document is still sitting rejected (a resubmission would have moved
  // review_status on to "submitted" and this maker's earlier rejected
  // review is no longer the one that matters).
  const { data: reviews } = await supabase
    .from("reviews")
    .select("*, documents ( id, original_filename, review_status, clients ( name, code ) )")
    .eq("submitted_by", user.id)
    .eq("status", "rejected")
    .order("decided_at", { ascending: false })
    .returns<ReviewRow[]>();

  const stillRejected = (reviews ?? []).filter((r) => r.documents?.review_status === "rejected");

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Needs your attention</h1>
      <p className="mb-6 text-sm text-slate-500">
        Your own submissions a checker sent back, most recent first. Open one to see their comment and
        resubmit.
      </p>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Rejected</th>
              <th className="px-4 py-2 font-medium">Client</th>
              <th className="px-4 py-2 font-medium">File</th>
              <th className="px-4 py-2 font-medium">Checker&apos;s comment</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {stillRejected.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                  {r.decided_at ? new Date(r.decided_at).toLocaleString() : "—"}
                </td>
                <td className="px-4 py-2 text-slate-900">
                  {r.documents?.clients ? `${r.documents.clients.name} (${r.documents.clients.code})` : "—"}
                </td>
                <td className="px-4 py-2 text-slate-900">{r.documents?.original_filename ?? "—"}</td>
                <td className="px-4 py-2 text-slate-700">{r.checker_comment ?? "—"}</td>
                <td className="px-4 py-2">
                  {r.documents && (
                    <Link href={`/documents/${r.documents.id}`} className="text-slate-900 underline hover:no-underline">
                      Fix and resubmit →
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {stillRejected.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Nothing needs your attention right now.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
