"use client";

import { useState, useTransition } from "react";
import { updateUserRole } from "./actions";
import type { UserRole } from "@/lib/supabase/types";

const ROLES: UserRole[] = ["maker", "checker", "admin"];

export default function RoleSelect({
  userId,
  currentRole,
  disabled,
}: {
  userId: string;
  currentRole: UserRole;
  disabled?: boolean;
}) {
  const [role, setRole] = useState(currentRole);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(newRole: UserRole) {
    setError(null);
    const previous = role;
    setRole(newRole);
    startTransition(async () => {
      try {
        await updateUserRole(userId, newRole);
      } catch (err) {
        setRole(previous);
        setError(err instanceof Error ? err.message : "Could not update role.");
      }
    });
  }

  return (
    <div>
      <select
        value={role}
        disabled={disabled || isPending}
        onChange={(e) => handleChange(e.target.value as UserRole)}
        className="rounded-md border border-slate-300 px-2 py-1 text-sm capitalize disabled:opacity-50"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
