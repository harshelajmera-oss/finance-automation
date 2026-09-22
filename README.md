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
- **Extraction summary**: a working, in-app view of every extracted document (vendor, vendor
  GSTIN, invoice number, amounts, TDS and net payable once a review exists, flag count) with
  totals, plus a **Download as Excel** button. TDS/net payable come from the document's latest
  review (Total − TDS − Already paid, same formula used everywhere else) and show "—" until one
  exists. This is not the spec's actual Google Sheets purchase register (that's Step 6) — it's a
  review aid for now.

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
- A **Razorpay bulk payout file** download, alongside the plain Excel export on the Approved page
  (maker, checker or admin can generate it, same filtered/selected/all choice). It follows
  Razorpay's published Bulk Payouts (composite) column format — Name, Fund Account Type/Number/IFSC,
  Amount (in paise), Currency, Mode, Purpose, Reference Id, Narration — on a "Payouts" sheet, with a
  second "Excluded rows" sheet listing anything left out and why, and a third sheet of notes
  (including a reminder to diff the column headers against RazorpayX's own current sample file
  before the first real upload, since we can't fetch razorpay.com's live docs from this
  environment to verify the format hasn't changed). Only rows routed "Pay via portal" or "Pay
  gross and recover TDS" are eligible; rows already paid outside the portal (card/employee/
  auto-debit) are excluded as not-applicable, and rows missing a vendor PAN, bank account or IFSC
  are excluded as on-hold, per the spec's payment-batch rule. "Pay gross and recover TDS" rows pay
  the full invoice total, not net of TDS — the TDS is recovered separately, not deducted from this
  payment. Included rows are marked as downloaded, same as the plain Excel export. This is a
  **download-only** feature — no live Razorpay API call is made; a direct-payout API integration
  was discussed and deferred until RazorpayX API access is set up on the firm's side.
- **Payment records**, per SPEC.md's Payments section. From the Approved page, tick the rows a
  payment covers (any mix of vendors/invoices — a payment can cover several at once, and a single
  invoice can be paid across more than one payment record if it's paid in parts) and hit "Record
  payment" to open a form for the actual payment details: payment date, mode (NEFT/RTGS/IMPS/UPI/
  card/auto-debit/employee-paid), UTR, reference (Razorpay payout ID or bank batch ref), paid-from
  ledger, a proof link, and an "this is an advance" flag that relaxes the rule that a payment date
  can't be before the invoice date. Each selected row's amount defaults to what's still outstanding
  on it (its payable amount minus anything already recorded against it) and is editable for a
  part-payment. Gross and TDS are split proportionally across a part-payment so they still sum
  correctly across the invoice's full history; a "pay gross and recover TDS" row instead records its
  full amount as gross with zero TDS, since none is deducted from that payment. The Approved page's
  new "Paid" column shows each row's outstanding balance or a "Paid in full" badge, and a "Payments"
  nav tab lists payment history with what each one covered. Recording happens through a single
  `record_payment` database function (never a direct insert) that re-checks the reviews are approved
  and in the caller's org and enforces the payment-date rule server-side, then writes an audit-log
  entry — the same SECURITY-DEFINER-gated-write pattern used elsewhere in this codebase.
- **UTR matching from an uploaded bank statement**, from a "Match UTRs from a bank statement" link
  on the Payments page. Upload the bank's payment status file or statement (.xlsx, .xls or .csv);
  it's parsed deterministically (no AI, same approach as the bulk payout sheet) with tolerant header
  matching for date/debit-amount/beneficiary-account/UTR/narration columns, since bank export formats
  vary and this hasn't been checked against a real sample from the firm's bank or RazorpayX's own
  payout report — **treat its column-matching as unverified until tried against a real file**, the
  same caveat the Razorpay payout file carries in the other direction. When there's no dedicated
  UTR/reference column, it falls back to pulling the longest alphanumeric token out of the narration
  text, flagged "(guessed)" in the preview. Each statement row is matched against payments still
  missing a UTR by amount, then narrowed by beneficiary account when one could be read; an
  unambiguous match is proposed, a tie between several same-amount payments is left for you to pick
  manually, and nothing is written to the database until you review the preview and hit confirm.
  Confirming goes through a new `apply_utr_matches` database function, logged to the audit log same
  as everything else. The TDS-recoverable ageing report for "pay gross and recover" vendors (the
  other remaining item in the spec's Payments section) isn't built yet.
- **Tally XML exports**, the first half of SPEC.md's Outputs section (a "Tally" nav menu, two pages).
  "New vendor ledgers" generates ledger-creation XML for approved vendors under Sundry Creditors
  (split Domestic/Foreign by whether a GSTIN or PAN is on file — the exact parent-group names are a
  guess at the firm's chart of accounts, verify against the real one). "Purchase / journal vouchers"
  generates one journal voucher per approved invoice — expense, GST input (named per Indian financial
  year, e.g. "Input CGST FY26-27"), TDS and vendor lines, with invoice no. and service month in the
  narration — and needs the vendor's ledger already imported first, or Tally will reject the voucher
  for an unknown ledger name. A "pay gross and recover TDS" row follows the spec's own worked example
  exactly: TDS goes to a "TDS Recoverable" debit line instead of reducing what's credited to the
  vendor, and the vendor is credited the full invoice amount. A row with an advance already netted
  off gets two extra lines clearing an assumed "Advance to &lt;vendor&gt;" ledger — rename that in the
  XML if the original advance was booked elsewhere. A row missing a usable vendor ledger name, expense
  ledger, or (when TDS applies) a TDS code with no Tally ledger name set, is excluded from the file
  with the reason shown, rather than guessed at. Each export marks what it included so it isn't
  re-exported by accident; an admin can override that to re-export. Both exports are logged to the
  audit log. Payment vouchers, prepaid transfers, and the live Google Sheets purchase register (the
  rest of the Outputs section) aren't built yet. **This has not been tested against a real TallyPrime
  instance** — there isn't one available in this environment — so treat every generated file as a
  draft: import into a test/backup company first and check the entries land correctly (in particular
  the debit-is-negative-amount sign convention used throughout) before ever pointing this at live
  books.
- **Vendors are now scoped per client**, not shared firm-wide — as of this pass, a second client
  (alongside Elemento) needed its own separate vendor list. `vendors.client_id` is a required
  column; vendor matching (GSTIN/PAN/name), the vendor list, and new-vendor creation from a review
  all now filter and insert by client, not just by org.
- **Expense Ledger Master**, one per client — a "Masters" nav menu, `/documents/expense-ledgers`.
  Maker, checker and admin can all add, amend or archive entries (archiving hides it from the
  dropdown without deleting anything a past review already points to, same as documents' own
  archive), plus a bulk Excel upload with a downloadable blank template. This master feeds a new
  "Expense ledger" dropdown that replaced the old free-text entry point in the review/checker grids
  and in the Tally purchase voucher export.
- **GST Vendor Master**, one per client — `/documents/gst-vendors`, same maker/checker/admin
  permissions, bulk upload and template as the Expense Ledger Master. Whenever a vendor's GSTIN is
  read off an invoice during extraction, it's checked against that client's list here and a
  validation flag is raised if the GSTIN isn't found, or is registered under a different party name
  — reusing the same validation-flag mechanism as every other automatic check.
- **Import ledgers from Tally**, `/documents/tally/import-ledgers` — a one-time way to seed the
  Vendor and Expense Ledger masters from Tally's own "List of Ledgers" export. That export is one
  flat column with no indentation, but a group heading is always bold and an actual ledger name is
  always plain text — confirmed against a real export — so the importer shows every detected group
  with its item count and lets you tick which ones to pull in as vendors or as expense ledgers
  (picking a deep sub-group like "Domestic Parties" rather than the "Sundry Creditors" umbrella
  itself, which has no direct ledgers of its own). Newly-imported vendors get only a name and Tally
  ledger name — GSTIN, PAN and bank details fill in naturally the next time an invoice for that
  vendor is processed.
- The **Review grid and Approve grid were reworked for readability** — each invoice is now a
  labeled card (client, vendor, flags and actions in a header row, then every field in a
  clearly-labeled grid below) instead of one cramped table row per invoice, and both now have a
  client filter at the top so picking a client shows only that client's records. Both also gained
  the new Expense Ledger dropdown described above, and the same live GSTIN badges described next.
- **Live GSTIN match badges**, next to the GSTIN fields themselves — in the single-document view
  (both the maker's and checker's editing screens) and both grids. Vendor GSTIN gets a green
  "match" / amber "not in master" badge checked against that client's GST Vendor Master as you
  type; billed-to GSTIN (shown next to the client name, since the grids don't have a dedicated
  billed-to-GSTIN field) gets a green "match" / red "mismatch" badge checked against the client's
  own GSTIN on file. These are live, editable-field checks, separate from (and faster to read than)
  the frozen extraction-time validation flag that already existed for the same comparison.
- **Line items auto-sum into Taxable value**, in the single-document view's Line Items editor —
  adding, editing, or removing a line's Amount recomputes Taxable value (then Total) automatically,
  the same auto-fill chain Taxable value already had with CGST/SGST/IGST. Editing Taxable value
  directly afterward still works and isn't overwritten until a line item changes again.
- A **Back button** in the header on every portal screen (maker, checker and admin alike), next to
  the "Finance Portal" logo — goes to whatever page you were on before, via the browser's own
  history.
- **Review grid fixes**: selecting "— none —" as the TDS code now correctly means 0% TDS
  everywhere (Review grid, Approve grid, and the single-document editor) instead of silently
  leaving whatever rate/amount was there before. The Review grid also gained the same manual
  "↻" recalculate button next to Net amt that the Approve grid already had, for when auto-fill
  needs a nudge after an out-of-order edit.
- **New-vendor Tally details, directly in both grids** — when a row would create a new vendor
  (Review grid) or is approving one still pending (Approve grid), an amber box now lets you set
  that vendor's Tally ledger name and TDS treatment right there, instead of having to open the
  single document first. Tally ledger name is optional: leaving it blank makes the Tally export
  fall back to the vendor's plain name, so there's nothing to fill in unless you want the ledger
  called something different from the vendor name itself.
- **Edit a recorded payment**, on the Payments page — an "Edit" button on each payment card lets
  you fix the date, mode, UTR, reference, paid-from ledger, proof link, advance flag, or notes
  after the fact, for when one was mistyped. The amount and which invoices it covers are
  deliberately not editable here, since those drive every review's outstanding balance — every
  edit is logged to the audit log with the old and new values, same as recording the payment in
  the first place.
- **Payment details in the Approved page's Excel export** — "Download as Excel" now adds Amount
  Paid, Payment Status (Unpaid / Partially paid / Paid in full), and the Payment Date(s), Mode(s),
  UTR(s) and Reference(s) for each row, pulled from every payment recorded against it (semicolon-
  joined when an invoice was part-paid across more than one payment).
- **Record several payments at once**, `/documents/payments/batch` — a grid alongside the existing
  single "Record a payment" screen, reachable the same way (tick rows on the Approved page). Where
  the original screen makes one payment record with one shared UTR/date covering every selected row
  (for when one bank transaction really did pay several invoices together), this one gives each row
  its own editable payment date/mode/UTR/reference/paid-from/proof/notes and submits each as its own
  separate payment record — for entering many distinct vendor payments efficiently side by side.
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
  exact same file is refused rather than double-importing every row. A row can optionally carry
  GSTIN + Taxable Value + CGST/SGST/IGST columns (for a GST-registered payee — a firm or company,
  not an individual mentor) and an Advance column (netted off the payable); when those are present,
  the row is treated as an ordinary invoiced amount rather than gross-up, and TDS is calculated on
  the taxable value rather than the GST-inclusive total, matching how a regular invoice is handled.
- A **Review grid** (maker) and **Approve grid** (checker): a wide, spreadsheet-style table showing
  every document ready for review/approval at once — vendor, GSTIN, PAN, billed-to, nature of
  service, amount, IGST/CGST/SGST, bank account, IFSC, gross-up, TDS code/rate/amount, and payment
  route are all editable directly in the table, no need to open each document individually — the
  Approve grid also has a one-click "View invoice" button so the checker can see the actual file
  without leaving the grid — the Review grid has the same button for the maker. Both grids scroll
  horizontally with the checkbox and action columns pinned in place, so they stay visible while
  scrolling through the wide middle section. Tick several rows and submit or approve them together — this is where
  the spec's "bulk approve" for flag-free items lives. Anything needing the full document view (line
  items, IRN, notes, or a genuinely one-off fix) still has an "Open" link. This is also the natural home for bulk payout
  rows, which otherwise come in dozens at a time. A red-flagged row still needs an override reason
  before it can be submitted, same rule as the single-document screen. Rejecting stays one row at a
  time, since a rejection needs its own comment. The original single-document screen (Documents →
  click a file) still exists side by side, unchanged, for anyone who prefers it. GST fields
  auto-fill for you — CGST and SGST always mirror each other and clear IGST (and vice versa, since a
  vendor charges one or the other, never both), and Total is computed live from Taxable value + GST
  while staying editable for a genuine rounding exception. TDS's "deduct at payment" calculation
  uses Taxable value as its base, matching the spec's own rule. The Review grid also has its own
  "Archive" per row and an "Archive selected" bulk action, for a row that was uploaded by mistake —
  no need to go back to the Documents list first.
- Documents can be **archived** by any signed-in team member — maker, checker or admin (Documents
  list → "Archive", individually or for a whole selection at once) — when one was uploaded by
  mistake — wrong client, wrong file, a stray duplicate. Nothing is ever actually deleted: an
  archived document just disappears from the normal lists (a "Show archived" filter brings it back)
  while its row, file and every linked extraction/review stay in the database, restorable at any
  time, with the archive/restore itself
  logged to the audit trail like everything else. The same goes for correcting a document filed
  under the wrong client (Documents list → "Edit" next to the client name) — also logged, not
  silently overwritten. Opening this up to every role, not just admins, matches the "checker can
  edit anything" trust model already used elsewhere in this app.
- The Documents list's bulk-selection dropdown now covers every status, not just "pending" —
  select everything currently shown, or narrow to one extraction status (pending/completed/failed)
  or review status (not submitted/submitted/approved/rejected) in one click, then extract or
  archive the whole selection at once.

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
- `supabase/migrations/0009_document_archive_and_client_reassign.sql` — archive/restore and
  client-reassignment columns and the audit trigger for them.
- `supabase/migrations/0010_document_archive_open_to_all_roles.sql` — opens archive/restore/
  reassign up to any signed-in team member, not just admins.
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
