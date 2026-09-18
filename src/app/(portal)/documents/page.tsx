import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Client, Document } from "@/lib/supabase/types";
import DocumentsTable from "./documents-table";

type DocumentRow = Document & { clients: Pick<Client, "name" | "code"> | null };

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
      <div className="mb-2 flex items-center justify-end gap-2">
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
        Click a file to see its detail page, or select several and extract them together. Review
        and approval come in a later step.
      </p>

      <DocumentsTable documents={documents ?? []} />
    </main>
  );
}
