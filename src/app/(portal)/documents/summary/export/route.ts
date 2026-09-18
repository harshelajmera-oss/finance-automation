import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { fetchExtractionSummaryRows } from "@/lib/extraction/summary";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const rows = await fetchExtractionSummaryRows(supabase);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Extractions");

  sheet.columns = [
    { header: "Received", key: "receivedAt", width: 14 },
    { header: "Client", key: "clientName", width: 30 },
    { header: "File", key: "fileName", width: 30 },
    { header: "Vendor", key: "vendorName", width: 30 },
    { header: "Invoice No", key: "invoiceNumber", width: 18 },
    { header: "Invoice Date", key: "invoiceDate", width: 14 },
    { header: "Taxable Value", key: "taxableValue", width: 14 },
    { header: "CGST", key: "cgst", width: 12 },
    { header: "SGST", key: "sgst", width: 12 },
    { header: "IGST", key: "igst", width: 12 },
    { header: "Total", key: "total", width: 14 },
    { header: "Flags", key: "flagCount", width: 8 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow({
      receivedAt: row.receivedAt ? new Date(row.receivedAt).toLocaleDateString() : "",
      clientName: `${row.clientName} (${row.clientCode})`,
      fileName: row.fileName,
      vendorName: row.vendorName ?? "",
      invoiceNumber: row.invoiceNumber ?? "",
      invoiceDate: row.invoiceDate ?? "",
      taxableValue: row.taxableValue ?? "",
      cgst: row.cgst ?? "",
      sgst: row.sgst ?? "",
      igst: row.igst ?? "",
      total: row.total ?? "",
      flagCount: row.flagCount,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="extractions-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
