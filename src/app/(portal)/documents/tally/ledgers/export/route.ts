import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchVendorsForLedgerExport } from "@/lib/tally/data";
import { buildLedgerCreationXml } from "@/lib/tally/ledger-export";

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
    return NextResponse.json({ error: "No vendors selected." }, { status: 400 });
  }

  const allVendors = await fetchVendorsForLedgerExport(supabase);
  const vendors = allVendors.filter((v) => ids.includes(v.id));

  const xml = buildLedgerCreationXml(vendors);

  await supabase.rpc("mark_vendors_tally_exported", { vendor_ids: vendors.map((v) => v.id) });

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Content-Disposition": `attachment; filename="tally-ledgers-${new Date().toISOString().slice(0, 10)}.xml"`,
    },
  });
}
