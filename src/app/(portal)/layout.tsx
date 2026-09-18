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

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="text-lg font-semibold text-slate-900">
            Finance Portal
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/documents" className="text-slate-600 hover:text-slate-900">
              Documents
            </Link>
            {profile?.role === "admin" && (
              <Link href="/admin/users" className="text-slate-600 hover:text-slate-900">
                Admin
              </Link>
            )}
            <SignOutButton />
          </nav>
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
