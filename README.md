# Finance Portal

A finance automation portal for Jhawar Mantri & Associates. The full plan is in
[`SPEC.md`](./SPEC.md); this README covers what's actually built and how to run it.

## What's built (Step 1, and part of Step 2)

The build sequence has six steps.

**Step 1 — accounts, database, logins, roles, audit log:**

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

**Step 2 — intake and filing (partial):**

- A **clients** table and an admin screen to add them (the firm's own clients, e.g. "Elemento
  Learning Technologies", code `ELEM`) — separate from `organizations`, which is the firm itself.
- A manual **upload** screen: pick a client, upload a file (PDF/JPG/PNG/XLS/XLSX).
- Filing into the `Client / financial-year / month` structure from the spec, based on the date
  received, using Supabase's file storage (standing in for Google Drive until that's connected).
- **Exact-duplicate detection**: an identical file uploaded twice is flagged as a duplicate of the
  original rather than stored again as a new document — nothing is deleted.
- A **documents** list to see what's come in.

Not yet built: email intake (needs a Google account connection), Google Drive filing, AI
extraction, the maker/checker review screens, vendor master, payments, and the Google Sheets/Tally
exports.

## How the pieces fit together

- **Next.js** (App Router, TypeScript, Tailwind) — the web app.
- **Supabase** — Postgres database, plus its built-in auth for logins. No external account has
  been connected yet; see "Connecting Supabase" below.
- `supabase/migrations/0001_init.sql` — organizations, profiles, roles, and the audit log.
- `supabase/migrations/0002_clients_and_documents.sql` — clients, documents, and file storage.
  Run this after `0001_init.sql`, the same way (paste into the Supabase SQL Editor, click Run).
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
   add a user with your email and a password, and under "User Metadata" set
   `{"role": "admin"}` (the database trigger uses this to set up their profile). Every account
   after this one can be created from `/admin/users` instead — an admin picks the person's email,
   role, and a temporary password there directly; there's no invite email to configure.
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
