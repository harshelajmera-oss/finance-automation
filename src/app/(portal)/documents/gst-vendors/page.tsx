import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchGstVendorMaster } from "@/lib/gst-vendors/data";
import type { Client, Profile } from "@/lib/supabase/types";
import GstVendorManager from "./gst-vendor-manager";

export default async function GstVendorsPage({ searchParams }: { searchParams: Promise<{ clientId?: string; showAll?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single<Pick<Profile, "role">>();

  const params = await searchParams;
  const { data: clients } = await supabase.from("clients").select("*").order("name", { ascending: true }).returns<Client[]>();
  const clientId = params.clientId || clients?.[0]?.id || "";
  const showAll = params.showAll === "1";

  // Pending entries (proposed inline from a "not in master" flag, awaiting a
  // checker's sign-off) always show here regardless of the archived filter —
  // otherwise nobody would ever see them to approve.
  const entries = clientId ? await fetchGstVendorMaster(supabase, clientId, { includeInactive: showAll, includeUnapproved: true }) : [];

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">GST Vendor Master</h1>
      <p className="mb-6 text-sm text-slate-500">
        Kept separately per client. Whenever a vendor&apos;s GSTIN is read off an invoice for a client,
        it&apos;s checked against that client&apos;s list here — an unlisted GSTIN, or one registered
        under a different name, is flagged during extraction. Maker, checker and admin can all add,
        amend or archive entries directly here; an entry proposed inline while reviewing or approving
        a document instead waits here for a checker or admin to approve it first.
      </p>
      <GstVendorManager clients={clients ?? []} clientId={clientId} entries={entries} showAll={showAll} role={profile?.role ?? null} />
    </main>
  );
}
