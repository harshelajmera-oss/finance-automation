import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";
import SignOutButton from "./sign-out-button";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();

  const role = profile?.role;

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-y-2 px-4 py-3">
          <Link href="/dashboard" className="text-lg font-semibold text-slate-900">
            Finance Portal
          </Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm">
            <Link href="/documents" className="text-slate-600 hover:text-slate-900">
              Documents
            </Link>
            <Link href="/documents/upload" className="text-slate-600 hover:text-slate-900">
              Upload
            </Link>
            <Link href="/documents/approved" className="text-slate-600 hover:text-slate-900">
              Approved
            </Link>
            {role === "maker" && (
              <Link href="/documents/my-attention" className="text-slate-600 hover:text-slate-900">
                Needs your attention
              </Link>
            )}
            {role === "checker" && (
              <Link href="/documents/checker-queue" className="text-slate-600 hover:text-slate-900">
                Checker queue
              </Link>
            )}
            {role === "checker" && (
              <Link href="/admin/vendors" className="text-slate-600 hover:text-slate-900">
                Vendors
              </Link>
            )}
            {role === "admin" && (
              <details className="group relative">
                <summary className="cursor-pointer list-none text-slate-600 marker:content-none hover:text-slate-900">
                  Admin
                </summary>
                <div className="absolute right-0 z-10 mt-2 w-48 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                  <Link href="/admin/clients" className="block px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                    Clients
                  </Link>
                  <Link href="/admin/vendors" className="block px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                    Vendors
                  </Link>
                  <Link href="/admin/tds-codes" className="block px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                    TDS codes
                  </Link>
                  <Link href="/admin/users" className="block px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                    Users and roles
                  </Link>
                  <Link href="/admin/audit-log" className="block px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                    Audit log
                  </Link>
                </div>
              </details>
            )}
            <SignOutButton />
          </nav>
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
