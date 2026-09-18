import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Client } from "@/lib/supabase/types";
import UploadForm from "./upload-form";

export default async function UploadPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .order("name", { ascending: true })
    .returns<Client[]>();

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
      <Link href="/dashboard" className="text-sm text-slate-500 hover:underline">
        ← Back to dashboard
      </Link>
      <h1 className="mt-2 mb-1 text-xl font-semibold text-slate-900">Upload a document</h1>
      <p className="mb-6 text-sm text-slate-500">
        For files received outside email — WhatsApp, printed receipts you&apos;ve scanned, and so
        on.
      </p>

      <UploadForm clients={clients ?? []} />
    </main>
  );
}
