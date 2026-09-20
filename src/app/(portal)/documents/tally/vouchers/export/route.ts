import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchReviewsForVoucherExport, voucherHoldReason } from "@/lib/tally/data";
import { buildPurchaseVoucherXml, type PurchaseVoucherInput } from "@/lib/tally/purchase-voucher-export";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const ids = (request.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean);
  if (ids.length === 0) {
    return NextResponse.json({ error: "No invoices selected." }, { status: 400 });
  }

  const allRows = await fetchReviewsForVoucherExport(supabase);
  const rows = allRows.filter((r) => ids.includes(r.reviewId) && !voucherHoldReason(r));

  if (rows.length === 0) {
    return NextResponse.json({ error: "None of the selected invoices are ready to export." }, { status: 400 });
  }

  const inputs: PurchaseVoucherInput[] = rows.map((r) => ({
    reviewId: r.reviewId,
    invoiceNumber: r.invoiceNumber,
    invoiceDate: r.invoiceDate,
    vendorLedgerName: r.vendorLedgerName as string,
    expenseLedgerName: r.expenseLedgerName as string,
    taxableValue: r.taxableValue,
    total: r.total,
    cgst: r.cgst,
    sgst: r.sgst,
    igst: r.igst,
    tdsLedgerName: r.tdsLedgerName,
    tdsAmount: r.tdsAmount,
    amountAlreadyPaid: r.amountAlreadyPaid,
    paymentRoute: r.paymentRoute,
  }));

  const fallbackDate = new Date().toISOString().slice(0, 10);
  const xml = buildPurchaseVoucherXml(inputs, fallbackDate);

  await supabase.rpc("mark_reviews_tally_exported", { review_ids: rows.map((r) => r.reviewId) });

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Content-Disposition": `attachment; filename="tally-vouchers-${new Date().toISOString().slice(0, 10)}.xml"`,
    },
  });
}
