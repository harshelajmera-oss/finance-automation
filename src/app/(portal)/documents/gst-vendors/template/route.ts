import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

export async function GET() {
  const workbook = new ExcelJS.Workbook();

  const sheet = workbook.addWorksheet("GST Vendor Master");
  sheet.columns = [
    { header: "GSTIN", key: "gstin", width: 20 },
    { header: "Party Name", key: "partyName", width: 45 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRow({ gstin: "29AAGCE4102N1ZI", partyName: "Elemento Learning Technologies Private Limited" });

  const notes = workbook.addWorksheet("Read before uploading");
  notes.columns = [{ header: "", key: "note", width: 100 }];
  [
    "This uploads/updates the GST Vendor Master for one client at a time — pick the client on the page before uploading.",
    "",
    "GSTIN must be the standard 15-character format — a row with an invalid GSTIN is skipped, not guessed at.",
    "",
    "GSTIN is unique per client — uploading one that already exists updates its Party Name rather than creating a duplicate.",
    "",
    "Delete the example row before uploading your real list.",
  ].forEach((note) => notes.addRow({ note }));

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="gst-vendor-master-template.xlsx"`,
    },
  });
}
