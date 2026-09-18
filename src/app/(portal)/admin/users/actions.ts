"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/lib/supabase/types";

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

  return { supabase, user, orgId: profile.org_id as string };
}

export async function updateUserRole(userId: string, role: UserRole) {
  const { supabase, user } = await requireAdmin();

  if (userId === user.id) {
    throw new Error("You cannot change your own role.");
  }

  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/users");
}

export async function createUserWithPassword(email: string, password: string, role: UserRole) {
  const { orgId } = await requireAdmin();

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role, org_id: orgId },
  });

  if (error) throw new Error(error.message);

  revalidatePath("/admin/users");
}

export async function setUserPassword(userId: string, password: string) {
  await requireAdmin();

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
  });

  if (error) throw new Error(error.message);
}
