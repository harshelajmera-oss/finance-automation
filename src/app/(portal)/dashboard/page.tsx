import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

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
      </div>

      {profile?.role === "checker" && (
        <div className="mt-6 space-y-2">
          <Link
            href="/documents/checker-queue"
            className="block rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
          >
            Checker queue →
          </Link>
        </div>
      )}

      {(profile?.role === "admin" || profile?.role === "checker") && (
        <div className="mt-6 space-y-2">
          <Link
            href="/admin/vendors"
            className="block rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
          >
            Manage vendors →
          </Link>
        </div>
      )}

      {profile?.role === "admin" && (
        <div className="mt-6 space-y-2">
          <Link
            href="/admin/clients"
            className="block rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
          >
            Manage clients →
          </Link>
          <Link
            href="/admin/tds-codes"
            className="block rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
          >
            Manage TDS codes →
          </Link>
          <Link
            href="/admin/users"
            className="block rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
          >
            Manage users and roles →
          </Link>
          <Link
            href="/admin/audit-log"
            className="block rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
          >
            View audit log →
          </Link>
        </div>
      )}

      <p className="mt-8 text-sm text-slate-400">
        Payments, Google Sheets and Tally exports aren&apos;t built yet — email intake and Google
        Drive filing are still to come too.
      </p>
    </main>
  );
}
