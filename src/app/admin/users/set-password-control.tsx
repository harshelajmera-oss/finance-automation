"use client";

import { useState, useTransition, type FormEvent } from "react";
import { setUserPassword } from "./actions";

export default function SetPasswordControl({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await setUserPassword(userId, password);
        setMessage("Password updated.");
        setPassword("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update password.");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-slate-500 underline hover:text-slate-700"
      >
        Set password
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <input
          type="text"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password"
          className="w-32 rounded-md border border-slate-300 px-2 py-1 text-xs"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {isPending ? "…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          Close
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {message && <p className="text-xs text-green-600">{message}</p>}
    </form>
  );
}
