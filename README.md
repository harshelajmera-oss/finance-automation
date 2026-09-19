# Finance Portal

A finance automation portal for Jhawar Mantri & Associates. The full plan is in
[`SPEC.md`](./SPEC.md); this README covers what's actually built and how to run it.

## What's built (Step 1, part of Step 2, Step 3, and Step 4)

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

**Step 3 — AI extraction of invoice fields:**

- Claude reads each uploaded PDF/JPG/PNG and extracts the fields listed in SPEC.md's "Extraction
  and validation" section (document, vendor, billed-to, service, amounts, notes) — from a document
  detail page reachable by clicking any file in the Documents list.
- The extracted values are never trusted blindly: a set of deterministic checks (not the AI itself)
  re-verifies GSTIN format, GSTIN-vs-PAN, CGST/SGST-vs-IGST by state, tax and line-item arithmetic,
  billed-to match, invoice completeness, dates, and late receipt — and shows the result as flags.
  Two checks from the spec aren't implemented yet: the GSTIN check-digit algorithm (format is
  checked, the checksum math is not) and IFSC lookup (needs Razorpay's database, a further
  connection).
- Every extraction attempt is its own row, kept forever — re-running adds a new attempt rather than
  overwriting the last one, and each one is logged to the audit trail like everything else.
- Nothing here is edited or confirmed by a person yet — that's the maker screen, Step 4.
- XLS/XLSX bulk payout sheets aren't sent through this at all (by design — they go through a
  different grid-view flow later, not per-invoice field extraction).
- **Bulk extraction**: checkboxes on the Documents list ("Select all pending" or pick individually)
  let you extract several documents in one go — they still run one at a time behind the scenes,
  with a progress count, since each is a separate call to Claude.
- **Extraction summary**: a working, in-app view of every extracted document (vendor, invoice
  number, amounts, flag count) with totals, plus a **Download as Excel** button. This is not the
  spec's actual Google Sheets purchase register (that's Step 6) — it's a review aid for now.

**Step 4 — maker review, checker approval, vendor master, TDS and gross-up:**

- A **vendor master** (`vendors` table): matched by GSTIN first, then PAN — never by name alone,
  per the spec (a similar name only shows as a warning). No match → a new vendor record is created
  automatically when a maker submits, sitting as "pending approval" until a checker or admin signs
  off on it. Entity type (Individual/Firm or LLP/Company/HUF) is derived from the PAN's 4th
  character, a fixed fact, not a guess.
- A **TDS codes** table an admin maintains (seeded with the two examples the spec names, 1027 and
  1024) — deliberately *not* auto-suggested from "nature of service," since your spec's own open
  points list a full TDS rate table as still undecided. The one rule the spec does state plainly is
  implemented: a vendor's last-used TDS code and ledger become its new defaults automatically.
- **Gross-up**: enter the agreed net amount and the rate, and the gross and TDS are computed for
  you — verified against the exact worked example in your spec (₹1,00,000 net @ 10% → ₹1,11,111
  gross, ₹11,111 TDS).
- The **maker screen**: every extracted field is editable, submitting is blocked while an
  error-level flag is open unless a reason is written, and picking a payment route (portal / card /
  employee / auto-debit / pay gross and recover) is part of submitting.
- The **checker queue**: everything awaiting a decision, oldest first, showing exactly what the
  maker changed from Claude's original read (old value → new value). A checker can now **edit any
  field before deciding** rather than only rejecting back to the maker — the edit lands in its own
  column, kept separate from the maker's version, so the record always shows who changed what.
  Approve, or reject with a required comment. A checker can never approve a document they submitted
  themselves — enforced in the database itself, not just the screen, matching the control rule from
  Step 1.
- **Three ways to bring in a document**, side by side on the Upload page: upload an invoice/receipt
  to be read automatically, **enter details manually with no file at all** (a document row with
  nothing stored — for a phone call or a verbal agreement, not just a fallback after a failed
  extraction), or upload a bulk payout sheet. Manual entry feeds the exact same review pipeline as
  an AI-read document, just recorded as manually entered.
- Client and vendor **edit screens**. Vendor identity fields (name, GSTIN, PAN, state, Udyam,
  ledger, TDS defaults) are an ordinary single-person edit. Bank account and IFSC are not — per the
  spec's own fraud-control rule, those go through a **propose → confirm** flow requiring a second
  person before the change takes effect.
- A persistent **navigation menu on every page** (not just the dashboard): Documents, Upload,
  Approved, plus Checker queue / Needs your attention depending on your role, plus an Admin menu.
- An **"Approved" tab**, visible to maker, checker and admin alike — expanded with bank account,
  IFSC, vendor GSTIN/PAN, tax breakup (taxable/CGST/SGST/IGST), TDS code/rate/amount and net
  payable, sourced from the approved review (the confirmed record), not the raw AI extraction.
  Rows can be filtered by vendor, received-date range or approved-date range, ticked individually
  for a custom download, or left on the default "only not yet downloaded" filter so re-exporting
  after new approvals doesn't repeat rows already sent for payment — every export (filtered, full,
  or a hand-picked selection) marks the rows it included as downloaded. The checker queue has its
  own, simpler export too.
- A maker's own **"Needs your attention"** view, listing their own rejected submissions so a
  rejection can't quietly go unnoticed.
- **Bulk payout sheets** (many payees, no invoices — mentor payouts and similar): uploading an XLS
  or XLSX on the Upload page is treated as a payout sheet, not a single invoice. It's parsed
  deterministically (no AI call) and every payee row becomes its own ordinary document, flowing
  through the exact same maker/checker/vendor-master/approved pipeline as anything else. Column
  headers for "Amount Paid" vs "Gross Amount" aren't trusted at face value — real sample sheets
  used both conventions inconsistently — so the larger of the two figures is taken as the gross and
  the smaller as the net actually paid, per rupee amounts rounded per the spec's gross-up rule. Rows
  with a missing PAN, or an unreadable/missing bank account or IFSC, are put on hold, matching the
  spec's payment-batch rule. A row whose bank account was stored as a number (risking a lost leading
  zero or scientific notation) is flagged for the maker to verify against the original file rather
  than silently trusted. The physical sheet is stored once (`payout_batches`); re-uploading the
  exact same file is refused rather than double-importing every row.
- A **Review grid** (maker) and **Approve grid** (checker): a wide, spreadsheet-style table showing
  every document ready for review/approval at once — vendor, GSTIN, PAN, billed-to, nature of
  service, amount, IGST/CGST/SGST, bank account, IFSC, gross-up, TDS code/rate/amount, and payment
  route are all editable directly in the table, no need to open each document individually. Tick
  several rows and submit or approve them together — this is where the spec's "bulk approve" for
  flag-free items lives. Anything needing the full document view (line items, IRN, notes, or a
  genuinely one-off fix) still has an "Open" link. This is also the natural home for bulk payout
  rows, which otherwise come in dozens at a time. A red-flagged row still needs an override reason
  before it can be submitted, same rule as the single-document screen. Rejecting stays one row at a
  time, since a rejection needs its own comment. The original single-document screen (Documents →
  click a file) still exists side by side, unchanged, for anyone who prefers it.

Not yet built: email intake (needs a Google account connection), Google Drive filing, payments, and
the Google Sheets/Tally exports.

## How the pieces fit together

- **Next.js** (App Router, TypeScript, Tailwind) — the web app.
- **Supabase** — Postgres database, plus its built-in auth for logins. No external account has
  been connected yet; see "Connecting Supabase" below.
- **Anthropic API** — reads uploaded documents and extracts their fields. Connected as of Step 3;
  the key lives in `.env.local` only, never committed.
- `supabase/migrations/0001_init.sql` — organizations, profiles, roles, and the audit log.
- `supabase/migrations/0002_clients_and_documents.sql` — clients, documents, and file storage.
- `supabase/migrations/0003_extraction.sql` — extraction results and the flags they raise.
- `supabase/migrations/0004_review.sql` — vendors, TDS codes, reviews, and the checker's approve/
  reject rules (including "never approve your own submission," enforced in the database).
- `supabase/migrations/0005_checker_edit_and_bank_control.sql` — the checker's own edit column, and
  the bank-detail propose → confirm flow.
- `supabase/migrations/0006_bulk_payout_sheets.sql` — the `payout_batches` table and the columns
  linking a document back to the sheet and row it came from.
- `supabase/migrations/0007_approved_export_tracking.sql` — tracks what's already been downloaded
  from the Approved list.
- `supabase/migrations/0008_manual_documents_without_a_file.sql` — makes storage_path/file_hash/
  file_size nullable, so manual entry can start with no file at all.
  Run each migration file after the last, in order, the same way (paste into the Supabase SQL
  Editor, click Run).
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
