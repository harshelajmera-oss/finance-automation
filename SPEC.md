# Finance Portal — Phase 1 Specification

Sep 18, 2026

## Purpose and scope

Phase 1 turns a received vendor document into an approved, fully validated purchase entry: captured, checked by a maker, approved by a checker, recorded with its payment details, and exported to Google Sheets and Tally.

The portal is built for Jhawar Mantri & Associates to run its clients' payables, and is designed from day one so it can later be sold to other firms and startups. Each organisation's data is walled off from every other's.

Pilot client: Elemento Learning Technologies Private Limited (NextLeap), GSTIN 29AAGCE4102N1ZI, books in TallyPrime.

In Phase 1:

- Intake by email and manual upload, filed into Google Drive
- AI extraction of invoice fields, with validation
- Maker review and edit, checker approval, full audit trail
- Vendor master, ledger suggestions, TDS recommendation and gross-up
- Payment records with UTR, entered manually or by bank-file upload
- Purchase register in Google Sheets and a Tally XML import file

Later phases:

| Phase | Adds |
|---|---|
| 2 | Direct Tally connector for firm-controlled installations; auto-posting |
| 3 | Razorpay / Cashfree payout API with UTR returned automatically |
| 4 | GSTR-2B reconciliation and reclassification journals, TDS reconciliation, dashboards |
| Later | Client logins, client-side approval for large payments, WhatsApp Business number intake, self-signup for other firms |

## Users and roles

All Phase 1 users are firm staff; clients do not log in yet. The checker is a senior person in the firm who also receives the payment OTP.

| Role | Can do | Cannot do |
|---|---|---|
| Maker | Upload, review and edit extracted fields; choose ledger, TDS code and rate; submit to checker; record payments | Approve anything |
| Checker | Approve or reject with a comment; approve payment batches; release payment on the bank or Razorpay with OTP | Edit fields; approve a document they made |
| Admin | Add clients and users; edit vendor master and TDS rules; sync Tally ledgers | Bypass maker-checker on a document |

Control rules:

- A user never approves a document they submitted, even if they hold both roles.
- A rejection returns the document to the maker with the checker's comment attached.
- Every action is logged with user, time, old value and new value. Logs cannot be edited or deleted.
- Changing bank details in the vendor master needs a second person's approval, because that is the most common payment-fraud route.
- The portal never stores OTPs, bank logins or card details.

## Document types and flow

The portal handles five document types. Each follows the same maker-checker path but differs in the checks and the accounting entry.

| Type | Examples from pilot | What differs |
|---|---|---|
| Domestic GST invoice | JQueen, 37BoldPartners, Quietcraft, AWS, Google Ads | GSTIN checks, CGST/SGST vs IGST, input ledger by FY, MSME clock |
| Unregistered vendor invoice | Akshat Jain, Navdeep Yadav, Charu Gupta, Canvaslabs | Match by PAN; no GST; TDS by PAN type |
| Foreign vendor invoice | Mobbin, MongoDB, Slack | RCM IGST, forex conversion, withholding decision, often already paid by card |
| Employee reimbursement | Dineout team lunch (Arindam) | Proof may be a receipt or screenshot; credit to employee's reimbursement ledger; one claim can hold many receipts |
| Bulk payout sheet | PMFC52 mentors, PMF interview mentors | Many payees, no invoices; gross-up; PAN and bank checks per row |

```
flowchart LR
  A[Received] --> B[Extracted]
  B --> C[Maker review]
  C --> D[Checker review]
  D -->|Reject| C
  D -->|Approve| E[Approved]
  E --> F[Payment initiated]
  F --> G[Paid]
  E -->|Already paid| G
  G --> H[Exported to Tally]
```

Every status change is stamped with user and time, so each document carries its own trail. "Already paid" covers card, auto-debit and employee-paid bills, which skip payment and go straight to accounting.

Two side states apply at any stage: On hold (for example PAN missing, with a reason) and Duplicate (linked to the original, never deleted).

## Intake

Documents arrive by email or manual upload, and every file lands in one Drive structure with a standard name.

**Email.** One dedicated Google Workspace inbox, with a plus-address per client, for example invoices+elemento@… Attachments (PDF, JPG, PNG, XLS/XLSX) are pulled every few minutes. Emails without attachments, or with only signature logos, are skipped and listed for review.

**Upload.** Drag-and-drop for files received on WhatsApp or elsewhere. The uploader picks the client; the portal records "uploaded by" as the source.

**Drive folders:** Client / FY / Month / file, for example Elemento / FY 2026-27 / 2026-09 /. Month = month the document was received.

**File naming after extraction:** ClientCode_VendorName_InvoiceNo_InvoiceDate.pdf, for example ELEM_JQueenGlobal_JQVL-26-27-011_2026-09-17.pdf. Characters not allowed in file names (such as / in 37BP/26-27/072) become -.

**Duplicate detection,** checked before a document reaches the maker:

- Same vendor GSTIN or PAN + same invoice number → marked Duplicate.
- Same vendor + same total + invoice dates within 7 days → flagged "possible duplicate" for the maker to confirm.
- Identical file content (same file hash) → marked Duplicate.

Invoice number alone is never used, because numbers like "3" or "32" repeat across vendors.

Multi-page and multi-invoice PDFs: the portal treats one PDF as one document. If extraction finds more than one invoice number, the maker is asked to split it.

## Extraction and validation

Claude's API reads each document and returns the fields below; every field keeps both the AI value and the maker's final value.

| Group | Fields |
|---|---|
| Document | Type, invoice number, invoice date, due date, IRN (if e-invoice), currency |
| Vendor | Name, address, state, GSTIN, PAN, Udyam number, bank account, IFSC, UPI ID, email |
| Billed to | Name, GSTIN, place of supply |
| Service | Description, SAC/HSN, service period (from–to), line items (description, qty, rate, amount) |
| Amounts | Taxable value, CGST, SGST, IGST, total, amount already paid (receipts) |
| Notes on document | TDS mentioned, reverse charge mentioned, credit lines against earlier invoices |

Each field carries a confidence level; low-confidence fields are highlighted for the maker.

Validation rules (run automatically, shown as flags on the maker screen):

| Check | Rule | Pilot example it catches |
|---|---|---|
| GSTIN format | 15 characters, valid state code, check digit correct | Charu Gupta's invoice wraps the client GSTIN across two lines |
| GSTIN vs PAN | Characters 3–12 of GSTIN must equal the PAN | Any mismatch between stated PAN and GSTIN |
| Tax type | Vendor state = client state → CGST+SGST; otherwise IGST. Uses the client's own state code, not a fixed "29" | Wrong tax head on any invoice |
| Tax amount | Taxable value × rate = tax, within ₹1 | Jhawar Mantri row: ₹3,61,000 × 18% = ₹64,980, sheet shows ₹64,890 |
| Line arithmetic | Qty × rate = amount per line; lines sum to subtotal, within ₹1 | Canvaslabs "₹2.500 × 6 = ₹15,000"; AWS 5-paise difference passes |
| Billed-to | Name and GSTIN match the client | Slack billed to "Elemento Technologies" |
| Invoice completeness | GST invoice without SAC/HSN or place of supply is flagged | Quietcraft (no SAC) |
| Dates | Invoice date not in the future; payment date not before invoice date (else treat as advance) | Karthi Subbaraman paid 17 Sep, invoice dated 19 Sep |
| Late receipt | Invoice date in an earlier month than receipt | Mobbin (dated 24 Jul) |
| Bank details | Account number stored as text; IFSC checked against Razorpay's free IFSC database; "IFSC-" prefixes stripped | Ansh Dwivedi row; account numbers in scientific notation |
| Tax flags | "Reverse charge" or foreign supplier → RCM flag; "TDS applicable" noted | MongoDB, Mobbin, 37BoldPartners |

## Maker screen and checker queue

The maker sees the document on the left and editable fields on the right; the checker sees the same screen read-only, with edits highlighted.

**Maker screen:**

- Left: the document, zoomable, all pages.
- Right: every extracted field, editable, with validation flags beside each.
- Suggested vendor ledger, expense ledger, TDS code, rate and amount, each changeable.
- Service month, and whether the cost is prepaid (with the period to spread it over).
- Advance adjustment: picks any open advance for the vendor and reduces the payable.
- Payment route: pay via portal, already paid by card, already paid by employee, auto-debit, or pay gross and recover TDS.
- Submit is blocked while any red flag is open, unless the maker writes a reason.

Edit log: every change stores field, AI value, final value, user and time. The same log shows extraction accuracy per vendor over time.

**Checker queue:**

- Sorted by due date, with MSME invoices and overdue items first.
- Fields the maker changed are highlighted, with the original AI value shown.
- Approve, or reject with a comment (comment required). No field editing.
- Bulk approve is allowed only for items with no open flags.

Bulk payout sheets open in a grid view instead: one row per payee, with PAN, bank and TDS checks per row. Rows with missing PAN are highlighted and put on hold; the rest can go forward.

## Vendor master, ledgers and TDS

The vendor master remembers each vendor's ledgers and TDS treatment, so the maker confirms suggestions rather than deciding from scratch. It starts from the 55-vendor Party GSTIN sheet, the Tally ledger list and the PANs in the payout sheets.

Vendor record: Tally ledger name (exact), GSTIN, PAN, entity type, state, MSME/Udyam number, bank account and IFSC, default expense ledger, TDS code and rate, gross-up (yes/no), TDS treatment (deduct at payment / pay gross and recover), year-to-date payments for thresholds.

Matching rules:

- Match on GSTIN; if none, on PAN.
- Never match on name alone. A similar name is shown as a warning only (Charu Gupta vs "Charu Agrawal"; two Navdeeps).
- No match → "new vendor": the maker fills the record, the checker approves it, and a Tally ledger-creation file is generated.

Ledger suggestion: vendor's default ledger first; otherwise the ledger most used for similar descriptions and SAC codes; otherwise the maker picks from the synced Tally list. Every maker choice updates the default, so suggestions improve over time.

TDS recommendation. The system suggests code, rate and amount; the maker makes the final call.

| Input | How it is used |
|---|---|
| Nature of service and SAC | Suggests the TDS code (for example 1027 professional at 10%, 1024 at 2%) |
| PAN 4th character | Entity type: P individual, F firm/LLP, C company, H HUF; drives rates that differ by entity |
| Vendor history | The team's previous code for the vendor wins (Quietcraft and 37BoldPartners: 1027 at 10%) |
| Year-to-date payments | Threshold status shown per vendor per FY |
| Base | TDS on taxable value, excluding GST when GST is shown separately |
| PAN missing | Row highlighted and put on hold; company obtains PAN from the vendor |

Each TDS code maps to one Tally ledger (for example 1027 → "TDS on Professional Fees", 1024 → "TDS On Contract"). The admin maintains this table under the Income-tax Act, 2025.

Gross-up (default for mentors; switchable per vendor). The agreed net amount is fixed, and TDS is rounded to the nearest rupee:

| Agreed net | Rate | Gross | TDS | Paid |
|---|---|---|---|---|
| ₹1,00,000 | 10% | ₹1,11,111 | ₹11,111 | ₹1,00,000 |
| ₹12,000 | 10% | ₹13,333 | ₹1,333 | ₹12,000 |

Today's sheet computes TDS on ₹1,11,111 as ₹11,111.10, so the mentor receives ₹99,999.90.

Other treatments:

- Foreign vendors (import of services): RCM IGST at the applicable rate is booked to "Input IGST RCM" and "IGST RCM Payable". USD invoices are converted at the rate chosen in open points. Withholding on foreign payments is flagged for the maker's decision.
- Prepaid: a service period over one month (Mobbin, Jul 2026–Jul 2027) books to Prepaid Expenses, with a monthly transfer schedule (₹9,600 → ₹800 a month).
- MSME: vendors with a Udyam number get a due date of the agreed term or 45 days, whichever is earlier, and appear first in the checker queue.
- GST input: always to the FY-wise input ledger (for example "IGST Input TY 26-27"). Reclassification to "Reflecting in 2B" ledgers happens after reconciliation in Phase 4.
- Blocked credit: food and similar items (the Dineout lunch) book GST to the expense, not to input.

## Payments

In Phase 1 the portal prepares the payment file and records what was paid; the checker still releases money on the bank or Razorpay with OTP.

Payment batch: the checker selects approved items, and the portal produces the bulk-payment file in the bank's or Razorpay's upload format. Items on hold (PAN missing, bank details unverified) cannot enter a batch.

Payment record (one per payment, linked to one or more invoices):

| Field | Notes |
|---|---|
| Payment date | Cannot be before invoice date unless marked as advance |
| UTR | From the bank status file or statement; manual entry allowed and logged |
| Mode | NEFT, RTGS, IMPS, UPI, card, auto-debit, employee-paid |
| Reference | Razorpay payout ID or bank batch reference |
| Amounts | Gross, TDS deducted, net paid |
| Paid from | Bank ledger (for example "HDFC 2511"), card ledger, or employee reimbursement ledger |
| Proof | Drive link to the payment advice, if uploaded |

The structure allows one payment for several invoices of the same vendor, one invoice paid in parts, and an advance paid first and adjusted later.

UTR capture: after payment, the maker uploads the bank's payment status file or statement. The portal matches rows to pending payments by amount, beneficiary account and date, and fills in the UTR. Unmatched rows are listed for manual matching.

Already-paid routes skip the batch and go straight to accounting:

| Route | Credit side of the entry | Pilot example |
|---|---|---|
| Company card | The card's ledger (for example "Arindam- Credit Card") | Slack |
| Employee paid | Employee's reimbursement ledger | Dineout lunch → "Arindam Mukherjee - Reimbursement" |
| Auto-debit | Bank ledger | Subscriptions debited directly |

Pay gross and recover TDS (Google Adwords pattern). The full invoice is paid to the vendor, but Elemento still deposits and reports the TDS:

- On booking: TDS is debited to "TDS Recoverable – Google Adwords" instead of reducing the payable.
- The TDS payable ledger is credited as usual, so the deposit and return are unaffected.
- When the vendor refunds, the receipt clears the recoverable.

The portal lists open recoverable balances by vendor with their age, so nothing sits unrecovered.

## Outputs

Phase 1 produces a live Google Sheet register and Tally XML files; the database stays the single source of truth.

Google Sheet purchase register (one sheet per client, refreshed on every status change). It keeps your current columns and adds the missing ones:

| Kept from current working | Added |
|---|---|
| Date, invoice no, GST invoice (derived, not typed), vendor, GSTIN, name check, supply type, GST check, description, value, CGST, SGST, IGST, total, TDS rate, TDS, section code, net payment, payment status, payment date | PAN, service month, expense ledger, RCM IGST, gross-up flag, UTR, payment mode, paid-from ledger, maker, checker, approval date, invoice link, payment proof link, portal status |

The invoice link is a Drive link, so it keeps working if the file is renamed or moved. The sheet is read-only; changes are made in the portal.

Tally XML files (import via TallyPrime):

| File | Contents |
|---|---|
| Ledger creation | New vendors approved in the portal, under Sundry Creditors (Domestic or Foreign Parties) |
| Purchase / journal vouchers | Expense, GST input (FY-wise), RCM, TDS and vendor lines; narration carries invoice no and service month |
| Payment vouchers | Bank or card line, vendor line, UTR in narration and bank allocation |
| Prepaid transfers | Monthly journal moving prepaid amounts to expense |

Ledger names are taken exactly from the synced Tally list, so imports do not fail on spelling. Each file is logged with who generated it and which documents it contains; a document cannot be exported twice without an admin override. Status moves to "Exported to Tally" once the file is marked as imported.

## Acceptance tests

Phase 1 is accepted when every pilot document below produces the expected result without manual workarounds.

| # | Document | Expected result |
|---|---|---|
| 1 | JQueen JQVL-26-27-011 | IGST ₹9,000 correct (MH → KA); TDS 1027 ₹5,000; net ₹54,000; "GST invoice" derived as Yes |
| 2 | 37BoldPartners 37BP/26-27/072 | Matched to "37BOLD PARTNERS"; MSME flag with 45-day due date; TDS ₹6,600; net ₹71,280; file name uses - for / |
| 3 | Quietcraft INV-007 | New vendor → ledger-creation file; missing SAC flagged; TDS ₹30,000; net ₹3,24,000 |
| 4 | AWS AIN2627002293002 | IRN captured; IGST ₹28,276.38 on ₹1,57,090.99; service month July, invoice August; 5-paise line difference passes |
| 5 | Google Ads 5685549614 | TDS 2% = ₹41,739; credit lines read; if pay-gross route chosen, ₹41,739 to TDS Recoverable – Google Adwords |
| 6 | Akshat Jain Aug202601 | Matched by PAN; TDS ₹1,200; net ₹10,800 |
| 7 | Navdeep Yadav #3 | Matched to the right Navdeep by PAN; invoice no "3" not treated as duplicate of another vendor's "3" |
| 8 | Charu Gupta CG08202601 | Not matched to Charu Agrawal; new vendor; client GSTIN rejoined across lines; TDS ₹5,600 |
| 9 | Canvaslabs #32 | "₹2.500 × 6" line flagged for maker; matched to "Canvaslab" by PAN once recorded |
| 10 | Mobbin SQUU8K7V-0001 | Foreign; RCM IGST ₹1,728; prepaid ₹9,600 spread at ₹800/month; late-receipt flag |
| 11 | MongoDB invoice | USD 159.02 converted; RCM booked; already-paid route |
| 12 | Slack SBIE-12355682 | Receipt, already paid by card; billed-to name flagged; RCM booked |
| 13 | Dineout screenshot | Employee reimbursement ₹12,771 to Staff Welfare Expenses; GST not claimed; credit Arindam Mukherjee - Reimbursement |
| 14 | PMFC52 payout sheet | 8 rows gross ₹1,11,111, TDS ₹11,111, net ₹1,00,000; Ankit Mittal on hold for missing PAN |
| 15 | PMF interview payout sheet | Nets ₹12,000 (Ansh, Prajwal) and ₹9,000 (Danush, Lokesh) after gross-up; Ansh row's bank and IFSC columns cleaned |
| 16 | Current working sheet | Jhawar Mantri GST amount flagged (₹64,980 expected); Karthi Subbaraman payment before invoice flagged as advance |

TDS figures above assume the codes your team used in the working sheet; the maker can change them.

## Cleanup, stack and build plan

Three cleanups come before go-live, the stack fits the ₹2,000–10,000 monthly budget, and the build runs in six steps, each tested on the pilot documents.

Data cleanup before go-live:

- [ ] Tally: remove hidden line-breaks from about 35 ledger names (shown as "x000D")
- [ ] Tally: merge duplicates (Amazon ×2, Liquidink Design ×3, LinkedIn ×2) and fix typos ("IGST Input TY 26-27", "TDS on Tenchinal Professional")
- [ ] Tally: move non-vendors (card ledgers, Bonus Payable, Prepaid Revenue, Suspense) out of Foreign Parties
- [ ] Payout sheets: store account numbers as text and re-check any that were in scientific notation

Stack:

| Part | Tool |
|---|---|
| Web app | Next.js, hosted on a low-cost paid tier |
| Database and logins | Supabase (Postgres) |
| Documents | Google Drive; intake from a Gmail inbox |
| Extraction | Claude API |
| Register | Google Sheets |
| IFSC check | Razorpay's free IFSC database |
| Code | GitHub, written and maintained with Claude Code |

Open points for you to decide:

- [ ] Forex rate for USD invoices: bank's rate on payment date, or RBI reference rate on invoice date?
- [ ] Late invoices (AWS, Mobbin): book in service month or in the month received?
- [ ] Full TDS code table for other natures: commission, rent, technical services, foreign payments, AWS
- [ ] Bank format for the payment file: which bank account pays vendors, or Razorpay bulk upload?
- [ ] Minimum amount below which a subscription is expensed rather than spread as prepaid

Build sequence:

1. Setup: accounts, database, logins, roles, audit log
2. Intake: Gmail inbox, upload, Drive filing, naming, duplicate checks
3. Extraction and validation on the 13 pilot documents
4. Maker screen, checker queue, vendor master, TDS and gross-up
5. Payment batches, bank file, UTR matching, already-paid routes
6. Google Sheet register and Tally XML; full run of the acceptance tests

---

**This repository currently implements Step 1 only** (accounts, roles, audit log). See `README.md` for what has been built and what is still needed before it can run.
