import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchExpenseLedgers } from "@/lib/expense-ledgers/data";
import type { Client, Document, ExpenseLedger, Profile, Review, TdsCode, Vendor } from "@/lib/supabase/types";
import CheckerGrid, { type CheckerGridRow } from "./checker-grid";

type ReviewRow = Review & {
  documents:
    | (Pick<Document, "id" | "client_id" | "original_filename" | "storage_path"> & {
        clients: Pick<Client, "name" | "code" | "gstin"> | null;
      })
    | null;
  vendors: Vendor | null;
};

interface SearchParams {
  vendorId?: string;
  clientId?: string;
  submittedFrom?: string;
  submittedTo?: string;
}

function inRange(dateStr: string, from?: string, to?: string): boolean {
  const t = new Date(dateStr).getTime();
  if (from && t < new Date(from).getTime()) return false;
  if (to && t > new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1) return false;
  return true;
}

export default async function CheckerGridPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  if (profile?.role !== "checker") redirect("/dashboard");

  const params = await searchParams;

  const [{ data: reviews }, { data: codes }, { data: clients }] = await Promise.all([
    supabase
      .from("reviews")
      .select("*, documents ( id, client_id, original_filename, storage_path, clients ( name, code, gstin ) ), vendors ( * )")
      .eq("status", "submitted")
      .order("submitted_at", { ascending: true })
      .returns<ReviewRow[]>(),
    supabase.from("tds_codes").select("*").order("code", { ascending: true }).returns<TdsCode[]>(),
    supabase.from("clients").select("*").order("name", { ascending: true }).returns<Client[]>(),
  ]);

  const allRows: CheckerGridRow[] = (reviews ?? [])
    .filter((r) => r.submitted_by !== user.id)
    .map((r) => ({
      reviewId: r.id,
      documentId: r.documents?.id ?? r.document_id,
      clientId: r.documents?.client_id ?? "",
      originalFilename: r.documents?.original_filename ?? "",
      hasFile: Boolean(r.documents?.storage_path),
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
      submittedAt: r.submitted_at,
    }));

  const vendorOptions = Array.from(
    new Map(allRows.filter((r) => r.vendor).map((r) => [r.vendor!.id, r.vendor!.name])).entries(),
  );

  const rows = allRows.filter((r) => {
    if (params.vendorId && r.vendor?.id !== params.vendorId) return false;
    if (params.clientId && r.clientId !== params.clientId) return false;
    if (!inRange(r.submittedAt, params.submittedFrom, params.submittedTo)) return false;
    return true;
  });

  const expenseLedgersByClient: Record<string, ExpenseLedger[]> = {};
  for (const clientId of new Set(rows.map((r) => r.clientId).filter(Boolean))) {
    expenseLedgersByClient[clientId] = await fetchExpenseLedgers(supabase, clientId);
  }

  const filterActive = params.vendorId || params.clientId || params.submittedFrom || params.submittedTo;
  const query = new URLSearchParams();
  if (params.vendorId) query.set("vendorId", params.vendorId);
  if (params.clientId) query.set("clientId", params.clientId);
  if (params.submittedFrom) query.set("submittedFrom", params.submittedFrom);
  if (params.submittedTo) query.set("submittedTo", params.submittedTo);
  const queryString = query.toString();

  return (
    <main className="mx-auto w-full max-w-[110rem] flex-1 px-4 py-10">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Approve grid</h1>
      <p className="mb-6 text-sm text-slate-500">
        Everything waiting on your decision, in one wide table. Edit anything before deciding, tick
        rows to approve several together, or reject one at a time with a comment.
      </p>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Client</label>
          <select name="clientId" defaultValue={params.clientId ?? ""} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">All clients</option>
            {(clients ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Vendor</label>
          <select name="vendorId" defaultValue={params.vendorId ?? ""} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">All vendors</option>
            {vendorOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Submitted from</label>
          <input type="date" name="submittedFrom" defaultValue={params.submittedFrom ?? ""} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Submitted to</label>
          <input type="date" name="submittedTo" defaultValue={params.submittedTo ?? ""} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800">
          Apply
        </button>
        {filterActive && (
          <Link href="/documents/checker-grid" className="text-sm text-slate-500 underline hover:text-slate-900">
            Clear filters
          </Link>
        )}
        {/* A real file download, not a page — Link would try to client-route it. */}
        <a
          href={`/documents/checker-grid/export${queryString ? `?${queryString}` : ""}`}
          className="ml-auto rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Download {filterActive ? "filtered" : "all"} as Excel
        </a>
      </form>

      <CheckerGrid rows={rows} tdsCodes={codes ?? []} expenseLedgersByClient={expenseLedgersByClient} />
    </main>
  );
}
