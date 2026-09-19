import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import type { Client, Document, Review, Vendor } from "@/lib/supabase/types";

type ReviewRow = Review & {
  documents: (Pick<Document, "id" | "original_filename"> & { clients: Pick<Client, "name" | "code"> | null }) | null;
  vendors: Vendor | null;
};

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
  const vendorId = params.get("vendorId");
  const submittedFrom = params.get("submittedFrom");
  const submittedTo = params.get("submittedTo");

  const { data: reviews } = await supabase
    .from("reviews")
    .select("*, documents ( id, original_filename, clients ( name, code ) ), vendors ( * )")
    .eq("status", "submitted")
    .order("submitted_at", { ascending: true })
    .returns<ReviewRow[]>();

  const rows = (reviews ?? [])
    .filter((r) => r.submitted_by !== user.id)
    .filter((r) => {
      if (vendorId && r.vendors?.id !== vendorId) return false;
      if (!inRange(r.submitted_at, submittedFrom, submittedTo)) return false;
      return true;
    });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Approve grid");

  sheet.columns = [
    { header: "Submitted", key: "submittedAt", width: 20 },
    { header: "Client", key: "clientName", width: 30 },
    { header: "File", key: "fileName", width: 30 },
    { header: "Vendor", key: "vendorName", width: 30 },
    { header: "New vendor", key: "newVendor", width: 12 },
    { header: "Vendor GSTIN", key: "vendorGstin", width: 18 },
    { header: "Vendor PAN", key: "vendorPan", width: 14 },
    { header: "Bank account", key: "bankAccount", width: 20 },
    { header: "IFSC", key: "ifsc", width: 14 },
    { header: "Taxable Value", key: "taxableValue", width: 14 },
    { header: "CGST", key: "cgst", width: 12 },
    { header: "SGST", key: "sgst", width: 12 },
    { header: "IGST", key: "igst", width: 12 },
    { header: "Total", key: "total", width: 14 },
    { header: "TDS Code", key: "tdsCode", width: 10 },
    { header: "TDS Rate", key: "tdsRate", width: 10 },
    { header: "TDS Amount", key: "tdsAmount", width: 14 },
    { header: "Payment Route", key: "paymentRoute", width: 18 },
    { header: "Flags overridden", key: "overridden", width: 16 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const r of rows) {
    const fields = r.checker_edited_fields ?? r.reviewed_fields;
    const vendor = r.vendors;

    sheet.addRow({
      submittedAt: formatDateTime(r.submitted_at),
      clientName: r.documents?.clients ? `${r.documents.clients.name} (${r.documents.clients.code})` : "",
      fileName: r.documents?.original_filename ?? "",
      vendorName: vendor?.name ?? fields?.vendor?.name ?? "",
      newVendor: vendor && !vendor.is_approved ? "Yes" : "No",
      vendorGstin: vendor?.gstin ?? fields?.vendor?.gstin ?? "",
      vendorPan: vendor?.pan ?? fields?.vendor?.pan ?? "",
      bankAccount: fields?.vendor?.bank_account ?? vendor?.bank_account ?? "",
      ifsc: fields?.vendor?.ifsc ?? vendor?.ifsc ?? "",
      taxableValue: fields?.amounts?.taxable_value ?? "",
      cgst: fields?.amounts?.cgst ?? "",
      sgst: fields?.amounts?.sgst ?? "",
      igst: fields?.amounts?.igst ?? "",
      total: fields?.amounts?.total ?? "",
      tdsCode: r.tds_code ?? "",
      tdsRate: r.tds_rate ?? "",
      tdsAmount: r.tds_amount ?? "",
      paymentRoute: r.payment_route,
      overridden: r.override_reason ? "Yes" : "No",
    });
  }

  sheet.getColumn("bankAccount").numFmt = "@";

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="approve-grid-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
