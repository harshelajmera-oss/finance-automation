import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { findVendorMatch } from "@/lib/vendors/match";
import { fetchExpenseLedgers } from "@/lib/expense-ledgers/data";
import { fetchGstVendorMaster } from "@/lib/gst-vendors/data";
import type { Client, Document, ExpenseLedger, Profile, TdsCode, Vendor } from "@/lib/supabase/types";
import type { ExtractedFields, ValidationFlag } from "@/lib/extraction/schema";
import DocumentGrid, { type GridRow } from "../document-grid";

type DocumentRow = Document & { clients: Pick<Client, "name" | "code" | "gstin"> | null };

export default async function ReviewGridPage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  if (profile?.role !== "maker") redirect("/dashboard");

  const params = await searchParams;
  const { data: clients } = await supabase.from("clients").select("*").order("name", { ascending: true }).returns<Client[]>();

  let documentsQuery = supabase
    .from("documents")
    .select("*, clients ( name, code, gstin )")
    .eq("extraction_status", "completed")
    .in("review_status", ["not_submitted", "rejected"])
    .is("archived_at", null)
    .order("received_at", { ascending: true });
  if (params.clientId) documentsQuery = documentsQuery.eq("client_id", params.clientId);
  const { data: documents } = await documentsQuery.returns<DocumentRow[]>();

  const docs = documents ?? [];
  const docIds = docs.map((d) => d.id);

  const rows: GridRow[] = [];
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

      const match = await findVendorMatch(supabase, doc.org_id, doc.client_id, fields.vendor.gstin, fields.vendor.pan, fields.vendor.name);

      rows.push({
        documentId: doc.id,
        reviewId: null,
        clientId: doc.client_id,
        originalFilename: doc.original_filename,
        hasFile: doc.storage_path !== null,
        clientName: doc.clients?.name ?? "—",
        clientCode: doc.clients?.code ?? "",
        clientGstin: doc.clients?.gstin ?? null,
        fields,
        flags: extraction.flags,
        vendorMatch: match.vendor as Vendor | null,
        possibleNameMatches: match.possibleNameMatches as Vendor[],
        rejectionComment: rejection?.comment ?? null,
        overrideReason: null,
        expenseLedger: null,
        tdsCode: null,
        tdsRate: null,
        tdsAmount: null,
        grossUp: null,
        paymentRoute: null,
      });
    }
  }

  const expenseLedgersByClient: Record<string, ExpenseLedger[]> = {};
  const vendorGstinsByClient: Record<string, string[]> = {};
  for (const clientId of new Set(rows.map((r) => r.clientId))) {
    expenseLedgersByClient[clientId] = await fetchExpenseLedgers(supabase, clientId);
    vendorGstinsByClient[clientId] = (await fetchGstVendorMaster(supabase, clientId)).map((g) => g.gstin);
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Review grid</h1>
        <form method="get" className="flex items-center gap-2 text-sm">
          <label className="text-slate-500">Client</label>
          <select name="clientId" defaultValue={params.clientId ?? ""} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">All clients</option>
            {(clients ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800">
            Apply
          </button>
        </form>
      </div>
      <p className="mb-6 text-sm text-slate-500">
        Everything ready for your review — edit fields directly, tick the ones you&apos;re done with,
        and submit several at once. Anything needing the full document view (line items, notes) still
        has an &quot;Open&quot; link.
      </p>
      <DocumentGrid mode="review" rows={rows} tdsCodes={tdsCodes} expenseLedgersByClient={expenseLedgersByClient} vendorGstinsByClient={vendorGstinsByClient} />
    </main>
  );
}
