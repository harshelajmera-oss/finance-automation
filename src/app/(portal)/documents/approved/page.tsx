import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchApprovedRows } from "@/lib/extraction/approved";
import ApprovedTable from "./approved-table";

interface SearchParams {
  vendorId?: string;
  receivedFrom?: string;
  receivedTo?: string;
  approvedFrom?: string;
  approvedTo?: string;
  showAll?: string;
}

export default async function ApprovedPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const params = await searchParams;
  // Default view is "only what hasn't been downloaded yet" — a checkbox
  // that's checked by default can't be represented by its own presence in
  // a GET form (an unchecked box submits nothing), so this is the opt-OUT.
  const showAll = params.showAll === "1";

  const allRows = await fetchApprovedRows(supabase);
  const vendorOptions = Array.from(new Map(allRows.filter((r) => r.vendorId).map((r) => [r.vendorId, r.vendorName])).entries());

  const rows = await fetchApprovedRows(supabase, {
    vendorId: params.vendorId || undefined,
    receivedFrom: params.receivedFrom || undefined,
    receivedTo: params.receivedTo || undefined,
    approvedFrom: params.approvedFrom || undefined,
    approvedTo: params.approvedTo || undefined,
    onlyNotExported: !showAll,
  });

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Approved</h1>
      <p className="mb-6 text-sm text-slate-500">
        Everything a checker has approved, visible to maker, checker and admin alike. This is the
        list to work from for payment — the actual payment batch is a later step.
      </p>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Vendor</label>
          <select name="vendorId" defaultValue={params.vendorId ?? ""} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">All vendors</option>
            {vendorOptions.map(([id, name]) => (
              <option key={id} value={id ?? ""}>
                {name}
              </option>
            ))}
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
        <div>
          <label className="mb-1 block text-xs text-slate-500">Approved from</label>
          <input type="date" name="approvedFrom" defaultValue={params.approvedFrom ?? ""} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Approved to</label>
          <input type="date" name="approvedTo" defaultValue={params.approvedTo ?? ""} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <label className="flex items-center gap-2 pb-1.5 text-sm text-slate-700">
          <input type="checkbox" name="showAll" value="1" defaultChecked={showAll} />
          Show already-downloaded rows too
        </label>
        <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800">
          Apply
        </button>
        {(params.vendorId || params.receivedFrom || params.receivedTo || params.approvedFrom || params.approvedTo || showAll) && (
          /* eslint-disable-next-line @next/next/no-html-link-for-pages */
          <a href="/documents/approved" className="text-sm text-slate-500 underline hover:text-slate-900">
            Clear filters
          </a>
        )}
      </form>

      <ApprovedTable rows={rows} currentFilters={params} />
    </main>
  );
}
