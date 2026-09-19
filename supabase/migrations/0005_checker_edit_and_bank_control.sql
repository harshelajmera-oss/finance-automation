-- Finance Portal — Step 4 refinements
--
-- 1. A checker can now edit any field before approving, instead of only
--    reject-and-return-to-maker — but the edit is kept as its own column,
--    separate from the maker's original submission, so the audit trail
--    always shows who changed what, not a silently merged final value.
-- 2. Vendor bank account / IFSC changes go through a two-person
--    propose-then-confirm flow — SPEC.md names this the most common
--    payment-fraud route, so it gets a control the rest of the vendor
--    master doesn't need. Every other vendor field (name, GSTIN, PAN,
--    ledger, TDS defaults) stays an ordinary single-person edit under
--    the existing vendors UPDATE policy from 0004.

-- ---------------------------------------------------------------------------
-- 1. Checker edits
-- ---------------------------------------------------------------------------
-- checker_comment (already on the table) doubles as both the approve/
-- reject note and the "why I edited this" note — one comment field, not two.
alter table public.reviews
  add column checker_edited_fields jsonb;

-- Replaces the 0004 version: logs the full before/after of a decision (not
-- just status), since a checker can now also change ledger/TDS/payment
-- route/gross-up while deciding. The big field blobs are excluded from the
-- audit copy since the reviews row itself already keeps them permanently.
create or replace function public.handle_review_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status <> 'submitted' then
    raise exception 'this review has already been decided';
  end if;
  if new.submitted_by = auth.uid() then
    raise exception 'you cannot approve or reject a document you submitted yourself';
  end if;

  new.checker_id = auth.uid();
  new.decided_at = now();

  update public.documents set review_status = new.status where id = new.document_id;

  if new.vendor_id is not null and new.status = 'approved' then
    update public.vendors
    set last_tds_code = coalesce(new.tds_code, last_tds_code),
        last_tds_rate = coalesce(new.tds_rate, last_tds_rate),
        default_expense_ledger = coalesce(new.expense_ledger, default_expense_ledger)
    where id = new.vendor_id;
  end if;

  insert into public.audit_log (actor_id, actor_email, org_id, action, table_name, record_id, old_value, new_value)
  values (
    auth.uid(), (select email from auth.users where id = auth.uid()), new.org_id,
    case when new.status = 'approved' then 'document.approved' else 'document.rejected' end,
    'documents', new.document_id::text,
    to_jsonb(old) - 'reviewed_fields' - 'checker_edited_fields',
    to_jsonb(new) - 'reviewed_fields' - 'checker_edited_fields'
  );

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Vendor bank-detail change requests
-- ---------------------------------------------------------------------------
create table public.vendor_bank_change_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  vendor_id uuid not null references public.vendors (id),
  proposed_bank_account text,
  proposed_ifsc text,
  requested_by uuid not null references auth.users (id),
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  confirmed_by uuid references auth.users (id),
  decided_at timestamptz
);

create index vendor_bank_change_requests_vendor_idx on public.vendor_bank_change_requests (vendor_id, status);

alter table public.vendor_bank_change_requests enable row level security;

create policy "admins and checkers read bank change requests in own org"
on public.vendor_bank_change_requests for select
using (org_id = public.current_org() and public.current_role() in ('admin', 'checker'));

create policy "admins and checkers request bank changes in own org"
on public.vendor_bank_change_requests for insert
with check (org_id = public.current_org() and public.current_role() in ('admin', 'checker') and requested_by = auth.uid());

create policy "admins and checkers decide bank changes in own org"
on public.vendor_bank_change_requests for update
using (org_id = public.current_org() and public.current_role() in ('admin', 'checker'))
with check (org_id = public.current_org());

-- No delete policy: a request, once made, stays on record either way.

create or replace function public.handle_bank_change_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status <> 'pending' then
    raise exception 'this request has already been decided';
  end if;
  if new.requested_by = auth.uid() then
    raise exception 'someone other than the requester must confirm a bank detail change';
  end if;

  new.confirmed_by = auth.uid();
  new.decided_at = now();

  if new.status = 'confirmed' then
    update public.vendors
    set bank_account = coalesce(new.proposed_bank_account, bank_account),
        ifsc = coalesce(new.proposed_ifsc, ifsc)
    where id = new.vendor_id;
  end if;

  insert into public.audit_log (actor_id, actor_email, org_id, action, table_name, record_id, old_value, new_value)
  values (
    auth.uid(), (select email from auth.users where id = auth.uid()), new.org_id,
    case when new.status = 'confirmed' then 'vendor.bank_details_changed' else 'vendor.bank_change_rejected' end,
    'vendors', new.vendor_id::text,
    jsonb_build_object('requested_by', new.requested_by),
    jsonb_build_object('bank_account', new.proposed_bank_account, 'ifsc', new.proposed_ifsc, 'status', new.status)
  );

  return new;
end;
$$;

create trigger trg_bank_change_decision
before update on public.vendor_bank_change_requests
for each row execute function public.handle_bank_change_decision();
