import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Client, Document, Profile } from "@/lib/supabase/types";
import DocumentsTable from "./documents-table";

type DocumentRow = Document & { clients: Pick<Client, "name" | "code"> | null };

interface SearchParams {
  clientId?: string;
  extractionStatus?: string;
  reviewStatus?: string;
  receivedFrom?: string;
  receivedTo?: string;
  showArchived?: string;
}

function inRange(dateStr: string, from?: string, to?: string): boolean {
  const t = new Date(dateStr).getTime();
  if (from && t < new Date(from).getTime()) return false;
  if (to && t > new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1) return false;
  return true;
}

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const params = await searchParams;

  const [{ data: profile }, { data: documents }, { data: clients }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single<Profile>(),
    supabase
      .from("documents")
      .select("*, clients ( name, code )")
      .order("received_at", { ascending: false })
      .returns<DocumentRow[]>(),
    supabase.from("clients").select("*").order("name", { ascending: true }).returns<Client[]>(),
  ]);

  const showArchived = params.showArchived === "1";
  const allDocs = documents ?? [];
  const rows = allDocs.filter((d) => {
    if (!showArchived && d.archived_at) return false;
    if (params.clientId && d.client_id !== params.clientId) return false;
    if (params.extractionStatus && d.extraction_status !== params.extractionStatus) return false;
    if (params.reviewStatus && d.review_status !== params.reviewStatus) return false;
    if (!inRange(d.received_at, params.receivedFrom, params.receivedTo)) return false;
    return true;
  });

  const filterActive =
    params.clientId || params.extractionStatus || params.reviewStatus || params.receivedFrom || params.receivedTo || showArchived;

  const query = new URLSearchParams();
  if (params.clientId) query.set("clientId", params.clientId);
  if (params.extractionStatus) query.set("extractionStatus", params.extractionStatus);
  if (params.reviewStatus) query.set("reviewStatus", params.reviewStatus);
  if (params.receivedFrom) query.set("receivedFrom", params.receivedFrom);
  if (params.receivedTo) query.set("receivedTo", params.receivedTo);
  if (showArchived) query.set("showArchived", "1");
  const queryString = query.toString();

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10">
      <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
        {profile?.role === "maker" && (
          <Link
            href="/documents/review-grid"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Review grid →
          </Link>
        )}
        <Link
          href="/documents/summary"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Extraction summary
        </Link>
        <Link
          href="/documents/upload"
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Upload a document
        </Link>
      </div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Documents</h1>
      <p className="mb-6 text-sm text-slate-500">
        Click a file to see its detail page, or select several and extract them together.
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
          <label className="mb-1 block text-xs text-slate-500">Extraction</label>
          <select
            name="extractionStatus"
            defaultValue={params.extractionStatus ?? ""}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">Any</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Review</label>
          <select
            name="reviewStatus"
            defaultValue={params.reviewStatus ?? ""}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">Any</option>
            <option value="not_submitted">Not submitted</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Received from</label>
          <input type="date" name="receivedFrom" defaultValue={params.receivedFrom ?? ""} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Received to</label>
          <input type="date" name="receivedTo" defaultValue={params.receivedTo ?? ""} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        {profile?.role === "admin" && (
          <label className="flex items-center gap-2 pb-1.5 text-sm text-slate-700">
            <input type="checkbox" name="showArchived" value="1" defaultChecked={showArchived} />
            Show archived
          </label>
        )}
        <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800">
          Apply
        </button>
        {filterActive && (
          <Link href="/documents" className="text-sm text-slate-500 underline hover:text-slate-900">
            Clear filters
          </Link>
        )}
        {/* A real file download, not a page — Link would try to client-route it. */}
        <a
          href={`/documents/export${queryString ? `?${queryString}` : ""}`}
          className="ml-auto rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Download {filterActive ? "filtered" : "all"} as Excel
        </a>
      </form>

      <DocumentsTable documents={rows} role={profile?.role} clients={clients ?? []} />
    </main>
  );
}
