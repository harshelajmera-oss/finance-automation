# Finance Portal

A finance automation portal for Jhawar Mantri & Associates. The full plan is in
[`SPEC.md`](./SPEC.md); this README covers what's actually built and how to run it.

## What's built (Step 1 of 6)

The build sequence has six steps. This repository currently implements **Step 1: accounts,
database, logins, roles, audit log** — nothing about documents, extraction, approvals or
payments exists yet.

Concretely:

- A Next.js app with a login page and a dashboard.
- A Supabase (Postgres) schema with three roles — **maker**, **checker**, **admin** — stored on
  a `profiles` table, one row per user.
- An **admin** screen to invite new users and change anyone's role.
- An **audit log** table that records who did what and when (old value → new value) for every
  role change. The database itself refuses to run `UPDATE` or `DELETE` on this table — for any
  role, including the app's own backend — so entries genuinely cannot be edited or removed once
  written, not even by an admin.
- Row Level Security so each firm's ("organization's") data is walled off from any other's, in
  preparation for later resale to other firms — Phase 1 itself only has one firm.

Everything else in `SPEC.md` (email/upload intake, AI extraction, the maker/checker document
screens, vendor master, payments, Google Sheets and Tally exports) is future work.

## How the pieces fit together

- **Next.js** (App Router, TypeScript, Tailwind) — the web app.
- **Supabase** — Postgres database, plus its built-in auth for logins. No external account has
  been connected yet; see "Connecting Supabase" below.
- `supabase/migrations/0001_init.sql` — the entire database schema (tables, roles, triggers,
  Row Level Security policies) as one script.
- `supabase/seed.sql` — creates the one organization row the firm's users belong to.

## Connecting Supabase (not done yet — do this when you're ready)

Nothing here talks to a real database until you create a Supabase project and connect it. That
project is a paid/free account outside this codebase, so it's a deliberate stopping point rather
than something done automatically.

1. Create a project at [supabase.com](https://supabase.com).
2. In the Supabase dashboard, open **SQL Editor**, paste in the contents of
   `supabase/migrations/0001_init.sql`, and run it. Then do the same with `supabase/seed.sql`.
3. In **Project Settings → API**, copy the Project URL, the `anon` public key, and the
   `service_role` secret key.
4. Copy `.env.local.example` to `.env.local` and paste those three values in.
5. Create the first admin account: in the Supabase dashboard under **Authentication → Users**,
   add a user with your email, and under "User Metadata" set
   `{"role": "admin"}` (the database trigger uses this to set up their profile). You can also do
   this by inviting yourself from `/admin/users` once one admin already exists — the first one
   has to be created directly in Supabase.
6. Run `npm run dev` and sign in at `/login`.

**Do not do this step for me without checking first** — creating the Supabase project and
generating its keys is something only you can do (it's your account), and I should confirm with
you before treating any real project/keys as connected.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Until Supabase is connected (see above),
the app will load but sign-in will fail with a configuration error.

```bash
npm run lint   # check code style
npm run build  # production build
```
