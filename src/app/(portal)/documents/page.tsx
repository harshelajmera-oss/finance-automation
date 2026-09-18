import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Client, Document } from "@/lib/supabase/types";
import ViewDocumentButton from "./view-document-button";

type DocumentRow = Document & { clients: Pick<Client, "name" | "code"> | null };

function ExtractionBadge({ status }: { status: Document["extraction_status"] }) {
  const styles: Record<Document["extraction_status"], string> = {
    completed: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    pending: "bg-slate-100 text-slate-500",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>{status}</span>
  );
}

export default async function DocumentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: documents } = await supabase
    .from("documents")
    .select("*, clients ( name, code )")
    .order("received_at", { ascending: false })
    .returns<DocumentRow[]>();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <div className="mb-2 flex items-center justify-end">
        <Link
          href="/documents/upload"
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Upload a document
        </Link>
      </div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Documents</h1>
      <p className="mb-6 text-sm text-slate-500">
        Everything received so far. Click a file to extract its fields or see what Claude read.
        Review and approval come in a later step.
      </p>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Received</th>
              <th className="px-4 py-2 font-medium">Client</th>
              <th className="px-4 py-2 font-medium">File</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Extraction</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(documents ?? []).map((d) => (
              <tr key={d.id} className="border-b border-slate-100 last:border-0">
                <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                  {new Date(d.received_at).toLocaleString()}
                </td>
                <td className="px-4 py-2 text-slate-900">
                  {d.clients ? `${d.clients.name} (${d.clients.code})` : "—"}
                </td>
                <td className="px-4 py-2">
                  <Link href={`/documents/${d.id}`} className="text-slate-900 underline hover:no-underline">
                    {d.original_filename}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  {d.status === "duplicate" ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Duplicate
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      Received
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <ExtractionBadge status={d.extraction_status} />
                </td>
                <td className="px-4 py-2">
                  <ViewDocumentButton documentId={d.id} />
                </td>
              </tr>
            ))}
            {(documents ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Nothing uploaded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
