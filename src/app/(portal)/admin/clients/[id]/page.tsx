import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Client, Profile } from "@/lib/supabase/types";
import EditClientForm from "./edit-client-form";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  if (currentProfile?.role !== "admin") {
    redirect("/dashboard");
  }

  const { data: client } = await supabase.from("clients").select("*").eq("id", id).single<Client>();

  if (!client) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <p className="text-sm text-slate-500">Client not found.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <Link href="/admin/clients" className="text-sm text-slate-500 hover:underline">
        ← All clients
      </Link>
      <h1 className="mt-2 mb-6 text-xl font-semibold text-slate-900">{client.name}</h1>

      <EditClientForm client={client} />
    </main>
  );
}
