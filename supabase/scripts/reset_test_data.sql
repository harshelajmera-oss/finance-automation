-- Finance Portal — one-off cleanup: wipe test/imported data before going live
--
-- This is NOT a migration — do not add it to supabase/migrations/ or track
-- it as part of the numbered sequence. It's a single-use script, run once
-- from the Supabase SQL Editor, right before switching the portal over to
-- real use.
--
-- Take a backup first (Supabase Dashboard -> Database -> Backups, or
-- Settings -> Database -> "Point in time recovery" if your plan has it) —
-- everything below is permanent and cannot be undone from within the app.
--
-- What this wipes: every document, extraction, review, payment, payment
-- allocation, bulk-payout-sheet batch, pending vendor bank-change request,
-- and the vendor list.
--
-- What this KEEPS: clients (Elemento/NEXTLEAP etc.), TDS codes, and every
-- login/role/organization — you'll sign in with the same accounts
-- afterwards, against clients and TDS codes already set up, onto a vendor
-- list and document history that starts empty.
--
-- The uploaded document FILES themselves live in Supabase Storage, not in
-- these tables, and Supabase deliberately blocks deleting storage.objects
-- rows directly by SQL ("Direct deletion from storage tables is not
-- allowed. Use the Storage API instead.") — delete those separately, from
-- the Dashboard: Storage -> the "documents" bucket -> select all -> Delete.
-- Do that either before or after this script; the order doesn't matter
-- since nothing here touches Storage.
--
-- Deletion order matters — each table below is deleted before the tables
-- it has a foreign key into, so this runs cleanly with no constraint
-- errors. Run the whole file in one go.

begin;

-- Transactional data, children before parents.
delete from public.payment_allocations;
delete from public.payments;
delete from public.vendor_bank_change_requests;
delete from public.reviews;
delete from public.extractions;
delete from public.documents;
delete from public.payout_batches;

-- Vendor master.
delete from public.vendors;

commit;

-- --------------------------------------------------------------------------
-- Audit log — deliberately built so nothing can update or delete its rows,
-- not even an admin or the app itself (see migration 0001's
-- audit_log_immutable() triggers and its REVOKE statement). Clearing it
-- means turning that protection off, clearing the table, then turning it
-- back on — never leave it permanently off. Run this block separately,
-- only if you're sure: old entries are just history and don't interfere
-- with anything above, so this step is optional even though you asked for
-- it — skip it if you change your mind.
-- --------------------------------------------------------------------------

begin;

alter table public.audit_log disable trigger trg_audit_log_no_update;
alter table public.audit_log disable trigger trg_audit_log_no_delete;

delete from public.audit_log;

alter table public.audit_log enable trigger trg_audit_log_no_update;
alter table public.audit_log enable trigger trg_audit_log_no_delete;

commit;
