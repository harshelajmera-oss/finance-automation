-- Finance Portal — Step 4: vendor master, TDS codes, maker review, checker queue
--
-- Two things this step deliberately does NOT do, because SPEC.md leaves them
-- as open questions rather than settled facts:
--   - It doesn't auto-suggest a TDS code from "nature of service" or PAN
--     entity type — the spec's own "Open points" list a full TDS code table
--     as still undecided. Only the one rule the spec states plainly is
--     applied: the vendor's own last-used code wins as the default.
--   - Tally ledger names are free text, not picked from a synced list —
--     there's no Tally connection yet.

-- ---------------------------------------------------------------------------
-- Vendors
-- ---------------------------------------------------------------------------
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  name text not null,
  tally_ledger_name text,
  gstin text,
  pan text,
  entity_type text, -- Individual / Firm or LLP / Company / HUF — derived from PAN's 4th character
  state text,
  udyam_number text,
  bank_account text,
  ifsc text,
  default_expense_ledger text,
  last_tds_code text,
  last_tds_rate numeric,
  gross_up boolean not null default false,
  tds_treatment text not null default 'deduct' check (tds_treatment in ('deduct', 'pay_gross_recover')),
  is_approved boolean not null default false,
  created_by uuid references auth.users (id),
  approved_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vendors_org_id_idx on public.vendors (org_id);
create index vendors_org_gstin_idx on public.vendors (org_id, gstin);
create index vendors_org_pan_idx on public.vendors (org_id, pan);

alter table public.vendors enable row level security;

create policy "members read vendors in own org"
on public.vendors for select
using (org_id = public.current_org());

create policy "members insert vendors in own org"
on public.vendors for insert
with check (org_id = public.current_org());

create policy "admins and checkers update vendors in own org"
on public.vendors for update
using (org_id = public.current_org() and public.current_role() in ('admin', 'checker'))
with check (org_id = public.current_org());

create or replace function public.handle_vendor_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (actor_id, actor_email, org_id, action, table_name, record_id, old_value, new_value)
    values (
      auth.uid(), (select email from auth.users where id = auth.uid()), new.org_id,
      'vendor.created', 'vendors', new.id::text, null,
      jsonb_build_object('name', new.name, 'gstin', new.gstin, 'pan', new.pan)
    );
  elsif tg_op = 'UPDATE' then
    insert into public.audit_log (actor_id, actor_email, org_id, action, table_name, record_id, old_value, new_value)
    values (
      auth.uid(), (select email from auth.users where id = auth.uid()), new.org_id,
      case when old.is_approved is distinct from new.is_approved and new.is_approved then 'vendor.approved' else 'vendor.updated' end,
      'vendors', new.id::text,
      to_jsonb(old) - 'updated_at',
      to_jsonb(new) - 'updated_at'
    );
    new.updated_at = now();
  end if;
  return new;
end;
$$;

create trigger trg_vendors_before_change
before insert or update on public.vendors
for each row execute function public.handle_vendor_change();

-- ---------------------------------------------------------------------------
-- TDS codes
-- Admin-maintained, per the spec ("The admin maintains this table"). Seeded
-- with the two codes the spec names as pilot examples; everything else is
-- an open point left to the admin to fill in.
-- ---------------------------------------------------------------------------
create table public.tds_codes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  code text not null,
  description text not null,
  default_rate numeric not null,
  tally_ledger_name text,
  created_at timestamptz not null default now()
);

create unique index tds_codes_org_code_idx on public.tds_codes (org_id, code);

alter table public.tds_codes enable row level security;

create policy "members read tds codes in own org"
on public.tds_codes for select
using (org_id = public.current_org());

create policy "admins manage tds codes in own org"
on public.tds_codes for insert
with check (org_id = public.current_org() and public.current_role() = 'admin');

create policy "admins update tds codes in own org"
on public.tds_codes for update
using (org_id = public.current_org() and public.current_role() = 'admin')
with check (org_id = public.current_org());

-- ---------------------------------------------------------------------------
-- Reviews
-- One row per submission. A maker inserts it; a checker updates it exactly
-- once (approve or reject). If rejected, the maker submits again as a new
-- row — the rejected one is never edited further, so the full history of
-- what happened stays on record.
-- ---------------------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id),
  org_id uuid not null references public.organizations (id),
  submitted_by uuid not null references auth.users (id),
  submitted_at timestamptz not null default now(),
  reviewed_fields jsonb not null,
  vendor_id uuid references public.vendors (id),
  expense_ledger text,
  tds_code text,
  tds_rate numeric,
  tds_amount numeric,
  gross_up boolean not null default false,
  payment_route text not null check (payment_route in ('portal', 'card', 'employee', 'auto_debit', 'pay_gross_recover')),
  override_reason text,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected')),
  checker_id uuid references auth.users (id),
  checker_comment text,
  decided_at timestamptz
);

create index reviews_document_id_idx on public.reviews (document_id, submitted_at desc);
create index reviews_org_status_idx on public.reviews (org_id, status);

alter table public.reviews enable row level security;

create policy "members read reviews in own org"
on public.reviews for select
using (org_id = public.current_org());

create policy "makers insert their own reviews in own org"
on public.reviews for insert
with check (org_id = public.current_org() and submitted_by = auth.uid() and public.current_role() = 'maker');

create policy "checkers decide reviews in own org"
on public.reviews for update
using (org_id = public.current_org() and public.current_role() = 'checker')
with check (org_id = public.current_org());

-- No delete policy anywhere: a review, once submitted, is permanent.

alter table public.documents
  add column review_status text not null default 'not_submitted'
    check (review_status in ('not_submitted', 'submitted', 'approved', 'rejected'));

create or replace function public.handle_review_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.documents set review_status = 'submitted' where id = new.document_id;

  if new.vendor_id is not null then
    update public.vendors
    set last_tds_code = coalesce(new.tds_code, last_tds_code),
        last_tds_rate = coalesce(new.tds_rate, last_tds_rate),
        default_expense_ledger = coalesce(new.expense_ledger, default_expense_ledger)
    where id = new.vendor_id;
  end if;

  insert into public.audit_log (actor_id, actor_email, org_id, action, table_name, record_id, old_value, new_value)
  values (
    new.submitted_by, (select email from auth.users where id = new.submitted_by), new.org_id,
    'document.submitted', 'documents', new.document_id::text, null,
    jsonb_build_object('review_id', new.id, 'payment_route', new.payment_route, 'override_reason', new.override_reason)
  );

  return new;
end;
$$;

create trigger trg_reviews_after_insert
after insert on public.reviews
for each row execute function public.handle_review_insert();

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

  insert into public.audit_log (actor_id, actor_email, org_id, action, table_name, record_id, old_value, new_value)
  values (
    auth.uid(), (select email from auth.users where id = auth.uid()), new.org_id,
    case when new.status = 'approved' then 'document.approved' else 'document.rejected' end,
    'documents', new.document_id::text,
    jsonb_build_object('status', old.status),
    jsonb_build_object('status', new.status, 'comment', new.checker_comment)
  );

  return new;
end;
$$;

create trigger trg_reviews_before_decision
before update on public.reviews
for each row execute function public.handle_review_decision();

-- Seed the two TDS codes SPEC.md names explicitly, for the one organization
-- Phase 1 has. Safe to run once; re-running would violate the unique index
-- rather than duplicate rows.
insert into public.tds_codes (org_id, code, description, default_rate, tally_ledger_name)
select id, '1027', 'Professional fees', 10, 'TDS on Professional Fees' from public.organizations
union all
select id, '1024', 'Contract', 2, 'TDS On Contract' from public.organizations;
