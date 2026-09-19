import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { findVendorMatch } from "@/lib/vendors/match";
import type { Client, Document, Extraction, Profile, Review, TdsCode, Vendor } from "@/lib/supabase/types";
import ViewDocumentButton from "../view-document-button";
import ExtractButton from "./extract-button";
import ReviewForm from "./review-form";
import ReviewSummary from "./review-summary";
import CheckerEditForm from "./checker-edit-form";

type DocumentRow = Document & { clients: Pick<Client, "name" | "code"> | null };

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    completed: "bg-green-100 text-green-800",
    approved: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    rejected: "bg-red-100 text-red-800",
    submitted: "bg-blue-100 text-blue-800",
    pending: "bg-slate-100 text-slate-700",
    not_submitted: "bg-slate-100 text-slate-700",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? styles.pending}`}>
      {status.replace("_", " ")}
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

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

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

  const { data: latestReview } = await supabase
    .from("reviews")
    .select("*")
    .eq("document_id", id)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle<Review>();

  const aiFields = extraction?.status === "completed" ? extraction.fields : null;
  const flags = extraction?.status === "completed" ? extraction.flags : [];
  const role = currentProfile?.role;

  let reviewVendor: Vendor | null = null;
  if (latestReview?.vendor_id) {
    const { data } = await supabase.from("vendors").select("*").eq("id", latestReview.vendor_id).single<Vendor>();
    reviewVendor = data;
  }

  // Fetch what the maker's form needs only when it's actually going to render.
  const needsReviewForm =
    aiFields !== null && role === "maker" && (document.review_status === "not_submitted" || document.review_status === "rejected");

  const canCheckerDecide =
    role === "checker" && latestReview?.status === "submitted" && latestReview.submitted_by !== user.id;

  let vendorMatch: Vendor | null = null;
  let possibleNameMatches: Vendor[] = [];
  let tdsCodes: TdsCode[] = [];

  if (needsReviewForm && aiFields) {
    const match = await findVendorMatch(supabase, document.org_id, aiFields.vendor.gstin, aiFields.vendor.pan, aiFields.vendor.name);
    vendorMatch = match.vendor;
    possibleNameMatches = match.possibleNameMatches;
  }

  if (needsReviewForm || canCheckerDecide) {
    const { data: codes } = await supabase
      .from("tds_codes")
      .select("*")
      .order("code", { ascending: true })
      .returns<TdsCode[]>();
    tdsCodes = codes ?? [];
  }

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

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">Extraction:</span>
        {statusBadge(document.extraction_status)}
        <span className="ml-2 text-sm text-slate-500">Review:</span>
        {statusBadge(document.review_status)}
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

      {aiFields && (
        <>
          {needsReviewForm && (
            <ReviewForm
              documentId={document.id}
              initialFields={document.review_status === "rejected" && latestReview ? latestReview.reviewed_fields : aiFields}
              flags={flags}
              vendorMatch={vendorMatch}
              possibleNameMatches={possibleNameMatches}
              tdsCodes={tdsCodes}
              rejectionComment={document.review_status === "rejected" ? latestReview?.checker_comment : null}
            />
          )}

          {!needsReviewForm && latestReview && (
            <div className="space-y-4">
              <ReviewSummary aiFields={aiFields} review={latestReview} vendor={reviewVendor} />

              {canCheckerDecide && (
                <CheckerEditForm
                  review={latestReview}
                  flags={flags}
                  tdsCodes={tdsCodes}
                  vendorName={reviewVendor?.name ?? null}
                  vendorPendingId={reviewVendor && !reviewVendor.is_approved ? reviewVendor.id : null}
                />
              )}
              {role === "checker" && latestReview.status === "submitted" && latestReview.submitted_by === user.id && (
                <p className="text-sm text-amber-700">
                  You submitted this document yourself, so you can&apos;t also approve it — another checker needs to.
                </p>
              )}
            </div>
          )}

          {!needsReviewForm && !latestReview && (
            <div className="space-y-4">
              {flags.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <h2 className="mb-2 text-sm font-semibold text-slate-900">Flags from extraction</h2>
                  <ul className="space-y-1">
                    {flags.map((f, i) => (
                      <li key={i} className={`text-sm ${f.severity === "error" ? "text-red-700" : "text-amber-700"}`}>
                        {f.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-sm text-slate-500">Waiting for a maker to review this document.</p>
            </div>
          )}

          <div className="mt-6">
            <ExtractButton documentId={document.id} />
            <p className="mt-1 text-xs text-slate-400">
              Re-running replaces nothing — it adds a new attempt, and the one above stays on record.
            </p>
          </div>
        </>
      )}
    </main>
  );
}
