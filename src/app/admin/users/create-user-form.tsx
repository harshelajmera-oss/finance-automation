"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createUserWithPassword } from "./actions";
import type { UserRole } from "@/lib/supabase/types";

export default function CreateUserForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        await createUserWithPassword(email, password, role);
        setMessage(
          `Account created for ${email}. Share the password with them directly — there's no invite email.`,
        );
        setEmail("");
        setPassword("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create account.");
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
      <div className="min-w-[160px]">
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Temporary password
        </label>
        <input
          type="text"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
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
        {isPending ? "Creating…" : "Create account"}
      </button>
      {message && <p className="w-full text-sm text-green-600">{message}</p>}
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
