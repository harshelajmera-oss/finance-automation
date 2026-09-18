import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Client, Document, Extraction } from "@/lib/supabase/types";
import ViewDocumentButton from "../view-document-button";
import ExtractButton from "./extract-button";

type DocumentRow = Document & { clients: Pick<Client, "name" | "code"> | null };

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    completed: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    pending: "bg-slate-100 text-slate-700",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? styles.pending}`}>
      {status}
    </span>
  );
}

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: document } = await supabase
    .from("documents")
    .select("*, clients ( name, code )")
    .eq("id", id)
    .single<DocumentRow>();

  if (!document) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <p className="text-sm text-slate-500">Document not found.</p>
        <Link href="/documents" className="text-sm text-slate-900 underline">
          Back to documents
        </Link>
      </main>
    );
  }

  const { data: extraction } = await supabase
    .from("extractions")
    .select("*")
    .eq("document_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<Extraction>();

  const fields = extraction?.status === "completed" ? extraction.fields : null;
  const flags = extraction?.status === "completed" ? extraction.flags : [];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <Link href="/documents" className="text-sm text-slate-500 hover:underline">
        ← All documents
      </Link>

      <div className="mt-2 mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{document.original_filename}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {document.clients ? `${document.clients.name} (${document.clients.code})` : "—"} ·
            received {new Date(document.received_at).toLocaleDateString()}
          </p>
        </div>
        <ViewDocumentButton documentId={document.id} />
      </div>

      <div className="mb-6 flex items-center gap-2">
        <span className="text-sm text-slate-500">Extraction:</span>
        {statusBadge(document.extraction_status)}
        {document.status === "duplicate" && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            Duplicate
          </span>
        )}
      </div>

      {document.extraction_status === "pending" && <ExtractButton documentId={document.id} />}

      {extraction?.status === "failed" && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{extraction.error_message}</p>
          <div className="mt-3">
            <ExtractButton documentId={document.id} />
          </div>
        </div>
      )}

      {fields && (
        <div className="space-y-6">
          {flags.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Flags</h2>
              <ul className="space-y-1">
                {flags.map((f, i) => (
                  <li
                    key={i}
                    className={`text-sm ${f.severity === "error" ? "text-red-700" : "text-amber-700"}`}
                  >
                    {f.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {flags.length === 0 && (
            <p className="text-sm text-green-700">No flags raised by the automatic checks.</p>
          )}

          <FieldGroup title="Document" data={fields.document} />
          <FieldGroup title="Vendor" data={fields.vendor} />
          <FieldGroup title="Billed to" data={fields.billed_to} />
          <FieldGroup
            title="Service"
            data={{
              description: fields.service.description,
              sac_hsn: fields.service.sac_hsn,
              service_period_from: fields.service.service_period_from,
              service_period_to: fields.service.service_period_to,
            }}
          />
          {fields.service.line_items.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Line items</h2>
              <table className="w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-1 pr-2 font-medium">Description</th>
                    <th className="py-1 pr-2 font-medium">Qty</th>
                    <th className="py-1 pr-2 font-medium">Rate</th>
                    <th className="py-1 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.service.line_items.map((line, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="py-1 pr-2 text-slate-900">{line.description ?? "—"}</td>
                      <td className="py-1 pr-2 text-slate-900">{line.qty ?? "—"}</td>
                      <td className="py-1 pr-2 text-slate-900">{line.rate ?? "—"}</td>
                      <td className="py-1 text-slate-900">{line.amount ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <FieldGroup title="Amounts" data={fields.amounts} />
          <FieldGroup
            title="Notes"
            data={{
              tds_mentioned: fields.notes.tds_mentioned,
              reverse_charge_mentioned: fields.notes.reverse_charge_mentioned,
              credit_lines_against_earlier_invoices: fields.notes.credit_lines_against_earlier_invoices,
            }}
          />

          {fields.low_confidence_fields.length > 0 && (
            <p className="text-xs text-slate-400">
              Low confidence on: {fields.low_confidence_fields.join(", ")}
            </p>
          )}

          <div>
            <ExtractButton documentId={document.id} />
            <p className="mt-1 text-xs text-slate-400">
              Re-running replaces nothing — it adds a new attempt, and the one above stays on record.
            </p>
          </div>

          <p className="text-xs text-slate-400">
            This is the AI&apos;s first read of the document — nothing here is confirmed yet. Reviewing
            and correcting these fields is the next step, not built yet.
          </p>
        </div>
      )}
    </main>
  );
}

function FieldGroup({ title, data }: { title: string; data: Record<string, unknown> }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold text-slate-900">{title}</h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        {Object.entries(data).map(([key, value]) => (
          <div key={key}>
            <dt className="text-xs text-slate-400">{key.replace(/_/g, " ")}</dt>
            <dd className="text-slate-900">
              {value === null || value === undefined || value === ""
                ? "—"
                : typeof value === "boolean"
                  ? value
                    ? "Yes"
                    : "No"
                  : String(value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
