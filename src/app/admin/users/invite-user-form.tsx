"use client";

import { useState, useTransition, type FormEvent } from "react";
import { inviteUser } from "./actions";
import type { UserRole } from "@/lib/supabase/types";

export default function InviteUserForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("maker");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await inviteUser(email, role);
        setMessage(`Invitation sent to ${email}.`);
        setEmail("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not send invitation.");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="min-w-[200px] flex-1">
        <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Role</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm capitalize"
        >
          <option value="maker">Maker</option>
          <option value="checker">Checker</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {isPending ? "Sending…" : "Send invitation"}
      </button>
      {message && <p className="w-full text-sm text-green-600">{message}</p>}
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
