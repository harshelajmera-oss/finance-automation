import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

export async function GET() {
  const workbook = new ExcelJS.Workbook();

  const sheet = workbook.addWorksheet("Expense Ledgers");
  sheet.columns = [
    { header: "Ledger Name", key: "name", width: 40 },
    { header: "Category", key: "category", width: 30 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRow({ name: "Office Rent", category: "Professional Expenses" });

  const notes = workbook.addWorksheet("Read before uploading");
  notes.columns = [{ header: "", key: "note", width: 100 }];
  [
    'This uploads/updates the Expense Ledger Master for one client at a time — pick the client on the page before uploading.',
    "",
    'Ledger Name is required and must be unique for that client — uploading a name that already exists updates its Category rather than creating a duplicate.',
    "",
    "Category is optional — a free-text grouping label (e.g. the Tally group it sits under), shown next to the ledger name but not otherwise used.",
    "",
    "Delete the example row (Office Rent) before uploading your real list.",
  ].forEach((note) => notes.addRow({ note }));

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="expense-ledger-template.xlsx"`,
    },
  });
}
