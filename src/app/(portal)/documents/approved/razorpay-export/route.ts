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

/** Razorpay's own rule for this template: narration can't carry special characters. */
function sanitizeNarration(s: string): string {
  return s.replace(/[^a-zA-Z0-9 ]/g, "").trim().slice(0, 30);
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

  // Matches Razorpay's "Bank transfer using Beneficiary details" bulk-upload
  // template exactly — column set, order, and header wording, confirmed
  // against the sample file downloaded from the RazorpayX dashboard. This is
  // NOT the separate "Bulk Payouts (composite)" API format (which uses paise
  // and Fund Account fields) — nothing in this app calls Razorpay's API
  // directly today, so that format has no consumer here.
  const sheet = workbook.addWorksheet("Bank transfer + Bene details");
  sheet.columns = [
    { header: "Beneficiary Name (Mandatory) Special characters not supported", key: "name", width: 28 },
    { header: "Beneficiary's Account Number (Mandatory) Typically 9-18 digits", key: "account", width: 22 },
    { header: "IFSC Code (Mandatory) 11 digit code of the beneficiary’s bank account. Eg. HDFC0004277", key: "ifsc", width: 16 },
    { header: "Payout Amount (Mandatory) Amount should be in rupees", key: "amount", width: 16 },
    { header: "Payout Mode (Mandatory) Select IMPS/NEFT/RTGS", key: "mode", width: 14 },
    { header: "Payout Narration (Optional) Will appear on bank statement (max 30 char with no special characters)", key: "narration", width: 26 },
    { header: "Notes (Optional) A note for internal reference", key: "notes", width: 30 },
    { header: "Phone Number (Optional)", key: "phone", width: 14 },
    { header: "Email ID (Optional)", key: "email", width: 20 },
    { header: "Contact Reference ID (Optional) Eg: Employee ID or Customer ID", key: "contactReferenceId", width: 20 },
    { header: "Payout Reference ID (Optional) Eg: Bill no or Invoice No or Pay ID", key: "payoutReferenceId", width: 22 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const row of payable) {
    const amount = payoutAmount(row) ?? 0;
    const narration = sanitizeNarration(`${row.vendorName} ${row.invoiceNumber ?? ""}`);
    sheet.addRow({
      name: row.vendorName,
      account: row.bankAccount ?? "",
      ifsc: row.ifsc ?? "",
      amount: Math.round(amount * 100) / 100,
      mode: "NEFT",
      narration,
      notes: `${row.clientName} (${row.clientCode}) — Invoice ${row.invoiceNumber ?? "N/A"}`,
      phone: "",
      email: "",
      contactReferenceId: "",
      payoutReferenceId: row.invoiceNumber ?? row.reviewId,
    });
  }
  sheet.getColumn("account").numFmt = "@";

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
    'This sheet follows Razorpay’s "Bank transfer using Beneficiary details" bulk-upload template exactly — the same one you’d download from RazorpayX Dashboard → Payouts → Bulk Payout → Bank transfer + Bene details.',
    "",
    "Amount is in plain RUPEES, matching that template’s own instruction (“Amount should be in rupees”) — not paise. If Razorpay ever changes their template, compare it against this sheet before uploading and let us know if anything's different.",
    "",
    "Mode is set to NEFT for every row (no per-transaction cap, settles same working day) — change it in the sheet before upload if you'd rather use IMPS or RTGS for specific rows.",
    "",
    '"Pay gross and recover TDS" rows are paid at the full invoice total (not net of TDS) — the TDS is recovered separately, not deducted from this payment.',
    "",
    "Rows already paid outside the portal (card / employee / auto-debit), and rows missing a bank account, IFSC or vendor PAN, are excluded from the payout tab and listed on the \"Excluded rows\" tab with the reason.",
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
