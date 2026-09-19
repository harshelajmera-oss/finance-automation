import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import type { Client, Document } from "@/lib/supabase/types";

type DocumentRow = Document & { clients: Pick<Client, "name" | "code"> | null };

function inRange(dateStr: string, from?: string | null, to?: string | null): boolean {
  const t = new Date(dateStr).getTime();
  if (from && t < new Date(from).getTime()) return false;
  if (to && t > new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1) return false;
  return true;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const clientId = params.get("clientId");
  const extractionStatus = params.get("extractionStatus");
  const reviewStatus = params.get("reviewStatus");
  const receivedFrom = params.get("receivedFrom");
  const receivedTo = params.get("receivedTo");

  const { data: documents } = await supabase
    .from("documents")
    .select("*, clients ( name, code )")
    .order("received_at", { ascending: false })
    .returns<DocumentRow[]>();

  const rows = (documents ?? []).filter((d) => {
    if (clientId && d.client_id !== clientId) return false;
    if (extractionStatus && d.extraction_status !== extractionStatus) return false;
    if (reviewStatus && d.review_status !== reviewStatus) return false;
    if (!inRange(d.received_at, receivedFrom, receivedTo)) return false;
    return true;
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Documents");

  sheet.columns = [
    { header: "Received", key: "receivedAt", width: 20 },
    { header: "Client", key: "clientName", width: 30 },
    { header: "File", key: "fileName", width: 40 },
    { header: "Source", key: "source", width: 14 },
    { header: "Status", key: "status", width: 12 },
    { header: "Extraction", key: "extractionStatus", width: 14 },
    { header: "Review", key: "reviewStatus", width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const d of rows) {
    sheet.addRow({
      receivedAt: formatDateTime(d.received_at),
      clientName: d.clients ? `${d.clients.name} (${d.clients.code})` : "",
      fileName: d.original_filename,
      source: d.source,
      status: d.status,
      extractionStatus: d.extraction_status,
      reviewStatus: d.review_status,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="documents-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
