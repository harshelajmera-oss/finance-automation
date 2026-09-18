import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";
import SignOutButton from "./sign-out-button";

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
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Finance Portal</h1>
        <SignOutButton />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">Signed in as</p>
        <p className="text-base font-medium text-slate-900">{profile?.email ?? user.email}</p>
        <p className="mt-3 text-sm text-slate-500">Role</p>
        <p className="text-base font-medium capitalize text-slate-900">
          {profile?.role ?? "unknown"}
        </p>
      </div>

      {profile?.role === "admin" && (
        <div className="mt-6 space-y-2">
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
        Documents, extraction, approvals and payments are not built yet — this is Step 1 of the
        build sequence (accounts, roles, audit log).
      </p>
    </main>
  );
}
