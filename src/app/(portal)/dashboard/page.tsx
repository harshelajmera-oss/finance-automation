import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

async function countRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  filters: Record<string, string>,
) {
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value);
  }
  const { count } = await query;
  return count ?? 0;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  const [pendingExtraction, awaitingReview, awaitingApproval] = await Promise.all([
    countRows(supabase, "documents", { extraction_status: "pending" }),
    countRows(supabase, "documents", { review_status: "not_submitted" }),
    countRows(supabase, "documents", { review_status: "submitted" }),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">Signed in as</p>
        <p className="text-base font-medium text-slate-900">{profile?.email ?? user.email}</p>
        <p className="mt-3 text-sm text-slate-500">Role</p>
        <p className="text-base font-medium capitalize text-slate-900">
          {profile?.role ?? "unknown"}
        </p>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-2xl font-semibold text-slate-900">{pendingExtraction}</p>
          <p className="text-xs text-slate-500">Pending extraction</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-2xl font-semibold text-slate-900">{awaitingReview}</p>
          <p className="text-xs text-slate-500">Awaiting review</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-2xl font-semibold text-slate-900">{awaitingApproval}</p>
          <p className="text-xs text-slate-500">Awaiting approval</p>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        <Link
          href="/documents/upload"
          className="block rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
        >
          Upload a document →
        </Link>
        <Link
          href="/documents"
          className="block rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
        >
          View documents →
        </Link>
        <Link
          href="/documents/approved"
          className="block rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
        >
          View approved →
        </Link>
        {profile?.role === "maker" && (
          <Link
            href="/documents/review-grid"
            className="block rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
          >
            Review grid (edit and submit several at once) →
          </Link>
        )}
        {profile?.role === "maker" && (
          <Link
            href="/documents/my-attention"
            className="block rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
          >
            Needs your attention →
          </Link>
        )}
        {profile?.role === "checker" && (
          <Link
            href="/documents/checker-grid"
            className="block rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
          >
            Approve grid (edit and approve several at once) →
          </Link>
        )}
      </div>

      <p className="mt-8 text-sm text-slate-400">
        Everything else — clients, vendors, TDS codes, users, the audit log — is in the menu at the
        top of every page now. Payments, Google Sheets and Tally exports aren&apos;t built yet —
        email intake and Google Drive filing are still to come too.
      </p>
    </main>
  );
}
