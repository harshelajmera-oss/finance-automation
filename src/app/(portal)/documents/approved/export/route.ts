import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { fetchApprovedRows } from "@/lib/extraction/approved";
import { fetchPaymentDetailsByReview } from "@/lib/extraction/payments";
import { formatDate } from "@/lib/format";

const MODE_LABELS: Record<string, string> = {
  neft: "NEFT",
  rtgs: "RTGS",
  imps: "IMPS",
  upi: "UPI",
  card: "Card",
  auto_debit: "Auto-debit",
  employee_paid: "Employee-paid",
};

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

  const paymentsByReview = await fetchPaymentDetailsByReview(supabase, rows.map((r) => r.reviewId));

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
    { header: "Amount Paid", key: "amountPaid", width: 14 },
    { header: "Payment Status", key: "paymentStatus", width: 16 },
    { header: "Payment Date(s)", key: "paymentDates", width: 16 },
    { header: "Payment Mode(s)", key: "paymentModes", width: 18 },
    { header: "UTR(s)", key: "utrs", width: 24 },
    { header: "Reference(s)", key: "references", width: 24 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    const payments = paymentsByReview.get(row.reviewId) ?? [];
    const amountPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const payoutTarget = row.paymentRoute === "pay_gross_recover" ? row.total : row.netPayable;
    const paymentStatus =
      payments.length === 0 ? "Unpaid" : payoutTarget !== null && amountPaid >= payoutTarget ? "Paid in full" : "Partially paid";

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
      amountPaid: payments.length > 0 ? amountPaid : "",
      paymentStatus,
      paymentDates: payments.map((p) => formatDate(p.paymentDate)).join("; "),
      paymentModes: payments.map((p) => MODE_LABELS[p.mode] ?? p.mode).join("; "),
      utrs: payments.map((p) => p.utr ?? "—").join("; "),
      references: payments.map((p) => p.reference ?? "—").join("; "),
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
