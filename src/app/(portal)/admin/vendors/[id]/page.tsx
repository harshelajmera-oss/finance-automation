import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, TdsCode, Vendor, VendorBankChangeRequest } from "@/lib/supabase/types";
import EditVendorForm from "./edit-vendor-form";
import BankChange from "./bank-change";

export default async function VendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  if (!currentProfile || !["admin", "checker"].includes(currentProfile.role)) {
    redirect("/dashboard");
  }

  const { data: vendor } = await supabase.from("vendors").select("*").eq("id", id).single<Vendor>();

  if (!vendor) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <p className="text-sm text-slate-500">Vendor not found.</p>
      </main>
    );
  }

  const { data: pendingRequest } = await supabase
    .from("vendor_bank_change_requests")
    .select("*")
    .eq("vendor_id", id)
    .eq("status", "pending")
    .maybeSingle<VendorBankChangeRequest>();

  const { data: tdsCodes } = await supabase.from("tds_codes").select("*").order("code", { ascending: true }).returns<TdsCode[]>();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <Link href="/admin/vendors" className="text-sm text-slate-500 hover:underline">
        ← All vendors
      </Link>
      <h1 className="mt-2 mb-1 text-xl font-semibold text-slate-900">{vendor.name}</h1>
      <p className="mb-6 text-sm text-slate-500">
        GSTIN {vendor.gstin ?? "—"} · PAN {vendor.pan ?? "—"} · {vendor.entity_type ?? "Entity type unknown"}
      </p>

      <div className="space-y-6">
        <EditVendorForm vendor={vendor} tdsCodes={tdsCodes ?? []} />
        <BankChange vendor={vendor} currentUserId={user.id} pendingRequest={pendingRequest ?? null} />
      </div>
    </main>
  );
}
