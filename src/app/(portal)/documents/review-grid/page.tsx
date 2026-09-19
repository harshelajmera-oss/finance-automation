import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { findVendorMatch } from "@/lib/vendors/match";
import type { Client, Document, Profile, TdsCode, Vendor } from "@/lib/supabase/types";
import type { ExtractedFields, ValidationFlag } from "@/lib/extraction/schema";
import ReviewGrid, { type GridDocRow } from "./review-grid";

type DocumentRow = Document & { clients: Pick<Client, "name" | "code" | "gstin"> | null };

export default async function ReviewGridPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  if (profile?.role !== "maker") redirect("/dashboard");

  const { data: documents } = await supabase
    .from("documents")
    .select("*, clients ( name, code, gstin )")
    .eq("extraction_status", "completed")
    .in("review_status", ["not_submitted", "rejected"])
    .order("received_at", { ascending: true })
    .returns<DocumentRow[]>();

  const docs = documents ?? [];
  const docIds = docs.map((d) => d.id);

  const rows: GridDocRow[] = [];
  let tdsCodes: TdsCode[] = [];

  if (docIds.length > 0) {
    const [{ data: extractions }, { data: rejectedReviews }, { data: codes }] = await Promise.all([
      supabase
        .from("extractions")
        .select("*")
        .in("document_id", docIds)
        .eq("status", "completed")
        .order("created_at", { ascending: false }),
      supabase
        .from("reviews")
        .select("*")
        .in("document_id", docIds)
        .eq("status", "rejected")
        .order("submitted_at", { ascending: false }),
      supabase.from("tds_codes").select("*").order("code", { ascending: true }).returns<TdsCode[]>(),
    ]);
    tdsCodes = codes ?? [];

    const latestExtractionByDoc = new Map<string, { fields: ExtractedFields; flags: ValidationFlag[] }>();
    for (const e of extractions ?? []) {
      if (!latestExtractionByDoc.has(e.document_id) && e.fields) {
        latestExtractionByDoc.set(e.document_id, { fields: e.fields as ExtractedFields, flags: (e.flags ?? []) as ValidationFlag[] });
      }
    }

    const latestRejectionByDoc = new Map<string, { fields: ExtractedFields; comment: string | null }>();
    for (const r of rejectedReviews ?? []) {
      if (!latestRejectionByDoc.has(r.document_id)) {
        latestRejectionByDoc.set(r.document_id, { fields: r.reviewed_fields as ExtractedFields, comment: r.checker_comment });
      }
    }

    for (const doc of docs) {
      const extraction = latestExtractionByDoc.get(doc.id);
      if (!extraction) continue;

      const rejection = doc.review_status === "rejected" ? latestRejectionByDoc.get(doc.id) : undefined;
      const fields = rejection?.fields ?? extraction.fields;

      const match = await findVendorMatch(supabase, doc.org_id, fields.vendor.gstin, fields.vendor.pan, fields.vendor.name);

      rows.push({
        documentId: doc.id,
        originalFilename: doc.original_filename,
        clientName: doc.clients?.name ?? "—",
        clientCode: doc.clients?.code ?? "",
        clientGstin: doc.clients?.gstin ?? null,
        fields,
        flags: extraction.flags,
        vendorMatch: match.vendor as Vendor | null,
        possibleNameMatches: match.possibleNameMatches as Vendor[],
        rejectionComment: rejection?.comment ?? null,
      });
    }
  }

  return (
    <main className="mx-auto w-full max-w-[110rem] flex-1 px-4 py-10">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Review grid</h1>
      <p className="mb-6 text-sm text-slate-500">
        Everything ready for your review, in one wide table — edit fields directly, tick the rows
        you&apos;re done with, and submit several at once. Anything needing the full document view
        (line items, IRN, notes) still has an &quot;Open&quot; link.
      </p>
      <ReviewGrid rows={rows} tdsCodes={tdsCodes} />
    </main>
  );
}
