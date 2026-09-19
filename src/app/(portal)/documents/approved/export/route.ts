import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { fetchApprovedRows } from "@/lib/extraction/approved";
import { formatDate } from "@/lib/format";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const idsParam = params.get("ids");

  const rows = await fetchApprovedRows(
    supabase,
    idsParam
      ? { reviewIds: idsParam.split(",").filter(Boolean) }
      : {
          vendorId: params.get("vendorId") || undefined,
          receivedFrom: params.get("receivedFrom") || undefined,
          receivedTo: params.get("receivedTo") || undefined,
          approvedFrom: params.get("approvedFrom") || undefined,
          approvedTo: params.get("approvedTo") || undefined,
          onlyNotExported: params.get("showAll") !== "1",
        },
  );

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Approved");

  sheet.columns = [
    { header: "Approved", key: "approvedAt", width: 14 },
    { header: "Client", key: "clientName", width: 30 },
    { header: "Vendor", key: "vendorName", width: 30 },
    { header: "Vendor GSTIN", key: "vendorGstin", width: 18 },
    { header: "Vendor PAN", key: "vendorPan", width: 14 },
    { header: "Bank account", key: "bankAccount", width: 20 },
    { header: "IFSC", key: "ifsc", width: 14 },
    { header: "Invoice No", key: "invoiceNumber", width: 18 },
    { header: "Invoice Date", key: "invoiceDate", width: 14 },
    { header: "Taxable Value", key: "taxableValue", width: 14 },
    { header: "CGST", key: "cgst", width: 12 },
    { header: "SGST", key: "sgst", width: 12 },
    { header: "IGST", key: "igst", width: 12 },
    { header: "Total", key: "total", width: 14 },
    { header: "TDS Code", key: "tdsCode", width: 10 },
    { header: "TDS Rate", key: "tdsRate", width: 10 },
    { header: "TDS Amount", key: "tdsAmount", width: 14 },
    { header: "Net Payable", key: "netPayable", width: 14 },
    { header: "Payment Route", key: "paymentRoute", width: 18 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow({
      approvedAt: row.approvedAt ? formatDate(row.approvedAt) : "",
      clientName: `${row.clientName} (${row.clientCode})`,
      vendorName: row.vendorName,
      vendorGstin: row.vendorGstin ?? "",
      vendorPan: row.vendorPan ?? "",
      bankAccount: row.bankAccount ?? "",
      ifsc: row.ifsc ?? "",
      invoiceNumber: row.invoiceNumber ?? "",
      invoiceDate: row.invoiceDate ?? "",
      taxableValue: row.taxableValue ?? "",
      cgst: row.cgst ?? "",
      sgst: row.sgst ?? "",
      igst: row.igst ?? "",
      total: row.total ?? "",
      tdsCode: row.tdsCode ?? "",
      tdsRate: row.tdsRate ?? "",
      tdsAmount: row.tdsAmount ?? "",
      netPayable: row.netPayable ?? "",
      paymentRoute: row.paymentRoute,
    });
  }

  // Force the bank-account column to text format so Excel never
  // reinterprets a long digit string as a number.
  sheet.getColumn("bankAccount").numFmt = "@";

  const buffer = await workbook.xlsx.writeBuffer();

  if (rows.length > 0) {
    await supabase.rpc("mark_reviews_exported", { review_ids: rows.map((r) => r.reviewId) });
  }

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="approved-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
