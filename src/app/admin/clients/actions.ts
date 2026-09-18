"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not signed in.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, org_id")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    throw new Error("Only admins can do this.");
  }

  return { supabase, orgId: profile.org_id as string };
}

export async function addClient(name: string, code: string, gstin: string) {
  const { supabase, orgId } = await requireAdmin();

  const { error } = await supabase.from("clients").insert({
    org_id: orgId,
    name: name.trim(),
    code: code.trim().toUpperCase(),
    gstin: gstin.trim() || null,
  });

  if (error) {
    if (error.code === "23505") {
      throw new Error(`A client with the code "${code.trim().toUpperCase()}" already exists.`);
    }
    throw new Error(error.message);
  }

  revalidatePath("/admin/clients");
}
