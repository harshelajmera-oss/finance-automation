import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Client, Document, Profile, Review, TdsCode, Vendor } from "@/lib/supabase/types";
import CheckerGrid, { type CheckerGridRow } from "./checker-grid";

type ReviewRow = Review & {
  documents: (Pick<Document, "id" | "original_filename"> & { clients: Pick<Client, "name" | "code" | "gstin"> | null }) | null;
  vendors: Vendor | null;
};

export default async function CheckerGridPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  if (profile?.role !== "checker") redirect("/dashboard");

  const [{ data: reviews }, { data: codes }] = await Promise.all([
    supabase
      .from("reviews")
      .select("*, documents ( id, original_filename, clients ( name, code, gstin ) ), vendors ( * )")
      .eq("status", "submitted")
      .order("submitted_at", { ascending: true })
      .returns<ReviewRow[]>(),
    supabase.from("tds_codes").select("*").order("code", { ascending: true }).returns<TdsCode[]>(),
  ]);

  const rows: CheckerGridRow[] = (reviews ?? [])
    .filter((r) => r.submitted_by !== user.id)
    .map((r) => ({
      reviewId: r.id,
      documentId: r.documents?.id ?? r.document_id,
      originalFilename: r.documents?.original_filename ?? "",
      clientName: r.documents?.clients?.name ?? "—",
      clientCode: r.documents?.clients?.code ?? "",
      clientGstin: r.documents?.clients?.gstin ?? null,
      fields: r.checker_edited_fields ?? r.reviewed_fields,
      vendor: r.vendors,
      vendorPendingId: r.vendors && !r.vendors.is_approved ? r.vendors.id : null,
      expenseLedger: r.expense_ledger,
      tdsCode: r.tds_code,
      tdsRate: r.tds_rate,
      tdsAmount: r.tds_amount,
      grossUp: r.gross_up,
      paymentRoute: r.payment_route,
      overrideReason: r.override_reason,
    }));

  return (
    <main className="mx-auto w-full max-w-[110rem] flex-1 px-4 py-10">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Approve grid</h1>
      <p className="mb-6 text-sm text-slate-500">
        Everything waiting on your decision, in one wide table. Edit anything before deciding, tick
        rows to approve several together, or reject one at a time with a comment.
      </p>
      <CheckerGrid rows={rows} tdsCodes={codes ?? []} />
    </main>
  );
}
