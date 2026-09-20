import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { fetchApprovedRows, isPayoutEligibleRoute, payoutAmount, payoutHoldReason, type ApprovedRow } from "@/lib/extraction/approved";
import { formatDate } from "@/lib/format";

const PAYMENT_ROUTE_LABELS: Record<string, string> = {
  portal: "Pay via portal",
  card: "Already paid by card",
  employee: "Already paid by employee",
  auto_debit: "Auto-debit",
  pay_gross_recover: "Pay gross and recover TDS",
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

  const payable: ApprovedRow[] = [];
  const skipped: { row: ApprovedRow; reason: string }[] = [];

  for (const row of rows) {
    if (!isPayoutEligibleRoute(row.paymentRoute)) {
      skipped.push({ row, reason: `Not paid via this batch (${PAYMENT_ROUTE_LABELS[row.paymentRoute] ?? row.paymentRoute})` });
      continue;
    }
    const hold = payoutHoldReason(row);
    if (hold) {
      skipped.push({ row, reason: hold });
      continue;
    }
    payable.push(row);
  }

  const workbook = new ExcelJS.Workbook();

  const sheet = workbook.addWorksheet("Payouts");
  sheet.columns = [
    { header: "Name", key: "name", width: 30 },
    { header: "Email", key: "email", width: 20 },
    { header: "Contact Number", key: "contact", width: 16 },
    { header: "Fund Account Type", key: "fundAccountType", width: 16 },
    { header: "Fund Account Number", key: "fundAccountNumber", width: 22 },
    { header: "Fund Account IFSC", key: "fundAccountIfsc", width: 14 },
    { header: "Amount", key: "amount", width: 14 },
    { header: "Currency", key: "currency", width: 10 },
    { header: "Mode", key: "mode", width: 10 },
    { header: "Purpose", key: "purpose", width: 14 },
    { header: "Reference Id", key: "referenceId", width: 38 },
    { header: "Narration", key: "narration", width: 30 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const row of payable) {
    const amount = payoutAmount(row) ?? 0;
    const narration = `${row.vendorName} ${row.invoiceNumber ?? ""}`.trim().slice(0, 30);
    sheet.addRow({
      name: row.vendorName,
      email: "",
      contact: "",
      fundAccountType: "bank_account",
      fundAccountNumber: row.bankAccount ?? "",
      fundAccountIfsc: row.ifsc ?? "",
      amount: Math.round(amount * 100),
      currency: "INR",
      mode: "NEFT",
      purpose: "vendor bill",
      referenceId: row.reviewId,
      narration,
    });
  }
  sheet.getColumn("fundAccountNumber").numFmt = "@";

  const skippedSheet = workbook.addWorksheet("Excluded rows");
  skippedSheet.columns = [
    { header: "Client", key: "clientName", width: 30 },
    { header: "Vendor", key: "vendorName", width: 30 },
    { header: "Invoice No", key: "invoiceNumber", width: 18 },
    { header: "Amount", key: "amount", width: 14 },
    { header: "Route", key: "route", width: 18 },
    { header: "Reason excluded", key: "reason", width: 40 },
  ];
  skippedSheet.getRow(1).font = { bold: true };
  for (const { row, reason } of skipped) {
    skippedSheet.addRow({
      clientName: `${row.clientName} (${row.clientCode})`,
      vendorName: row.vendorName,
      invoiceNumber: row.invoiceNumber ?? "",
      amount: payoutAmount(row) ?? row.netPayable ?? "",
      route: PAYMENT_ROUTE_LABELS[row.paymentRoute] ?? row.paymentRoute,
      reason,
    });
  }

  const notesSheet = workbook.addWorksheet("Read before uploading");
  notesSheet.columns = [{ header: "", key: "note", width: 110 }];
  const notes = [
    `Generated ${formatDate(new Date())} — ${payable.length} payout(s), ${skipped.length} excluded (see "Excluded rows" tab).`,
    "",
    "This sheet follows Razorpay's published Bulk Payouts (composite) column format: Name, Email, Contact Number, Fund Account Type, Fund Account Number, Fund Account IFSC, Amount, Currency, Mode, Purpose, Reference Id, Narration.",
    "",
    "IMPORTANT — verify before your first real upload: RazorpayX can amend this format over time. Before uploading for the first time, go to your RazorpayX Dashboard → Payouts → Bulk Payout → Download Sample File, and compare its column headers against this sheet. If they differ, tell us and we'll adjust the export.",
    "",
    "Amount is in PAISE (Amount column = rupees x 100), per Razorpay's bulk payout spec — e.g. Rs.1,000.00 is written as 100000. Double-check this against the sample file too, since an unnoticed mismatch here would over- or under-pay by 100x.",
    "",
    "Mode is set to NEFT for every row (no per-transaction cap, settles same working day) — change it in the sheet before upload if you'd rather use IMPS or RTGS for specific rows.",
    "",
    "Purpose is set to \"vendor bill\" for every row, one of Razorpay's default purpose classifications — change per row if your RazorpayX account uses a different classification.",
    "",
    "\"Pay gross and recover TDS\" rows are paid at the full invoice total (not net of TDS) — the TDS is recovered separately, not deducted from this payment.",
    "",
    "Rows already paid outside the portal (card / employee / auto-debit), and rows missing a bank account, IFSC or vendor PAN, are excluded from the Payouts tab and listed on the \"Excluded rows\" tab with the reason.",
  ];
  for (const note of notes) notesSheet.addRow({ note });

  const buffer = await workbook.xlsx.writeBuffer();

  if (payable.length > 0) {
    await supabase.rpc("mark_reviews_exported", { review_ids: payable.map((r) => r.reviewId) });
  }

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="razorpay-payout-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
