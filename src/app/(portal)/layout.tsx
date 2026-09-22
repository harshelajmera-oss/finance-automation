import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";
import SignOutButton from "./sign-out-button";
import BackButton from "./back-button";

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
          <div className="flex items-center gap-3">
            <BackButton />
            <Link href="/dashboard" className="text-lg font-semibold text-slate-900">
              Finance Portal
            </Link>
          </div>
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
            <Link href="/documents/payments" className="text-slate-600 hover:text-slate-900">
              Payments
            </Link>
            <details className="group relative">
              <summary className="cursor-pointer list-none text-slate-600 marker:content-none hover:text-slate-900">Masters</summary>
              <div className="absolute right-0 z-10 mt-2 w-56 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                <Link href="/documents/expense-ledgers" className="block px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                  Expense Ledgers
                </Link>
                <Link href="/documents/gst-vendors" className="block px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                  GST Vendor Master
                </Link>
              </div>
            </details>
            <details className="group relative">
              <summary className="cursor-pointer list-none text-slate-600 marker:content-none hover:text-slate-900">Tally</summary>
              <div className="absolute right-0 z-10 mt-2 w-56 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                <Link href="/documents/tally/ledgers" className="block px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                  New vendor ledgers
                </Link>
                <Link href="/documents/tally/vouchers" className="block px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                  Purchase / journal vouchers
                </Link>
                <Link href="/documents/tally/import-ledgers" className="block px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                  Import ledgers from Tally
                </Link>
              </div>
            </details>
            {role === "maker" && (
              <Link href="/documents/review-grid" className="text-slate-600 hover:text-slate-900">
                Review grid
              </Link>
            )}
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
              <Link href="/documents/checker-grid" className="text-slate-600 hover:text-slate-900">
                Approve grid
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
