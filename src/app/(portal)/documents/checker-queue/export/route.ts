import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: reviews } = await supabase
    .from("reviews")
    .select(
      "*, documents ( original_filename, received_at, clients ( name, code ) ), vendors ( name, is_approved )",
    )
    .eq("status", "submitted")
    .order("submitted_at", { ascending: true });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Checker queue");

  sheet.columns = [
    { header: "Submitted", key: "submittedAt", width: 18 },
    { header: "Client", key: "clientName", width: 30 },
    { header: "File", key: "fileName", width: 30 },
    { header: "Vendor", key: "vendorName", width: 30 },
    { header: "New vendor", key: "newVendor", width: 12 },
    { header: "Flags overridden", key: "overridden", width: 16 },
    { header: "Override reason", key: "overrideReason", width: 40 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const r of reviews ?? []) {
    const doc = r.documents as { original_filename: string; received_at: string; clients: { name: string; code: string } | null } | null;
    const vendor = r.vendors as { name: string; is_approved: boolean } | null;

    sheet.addRow({
      submittedAt: new Date(r.submitted_at).toLocaleString(),
      clientName: doc?.clients ? `${doc.clients.name} (${doc.clients.code})` : "",
      fileName: doc?.original_filename ?? "",
      vendorName: vendor?.name ?? "",
      newVendor: vendor && !vendor.is_approved ? "Yes" : "No",
      overridden: r.override_reason ? "Yes" : "No",
      overrideReason: r.override_reason ?? "",
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="checker-queue-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
