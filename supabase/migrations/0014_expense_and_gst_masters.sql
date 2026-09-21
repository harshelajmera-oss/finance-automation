-- Finance Portal — per-client masters: Expense Ledger, GST Vendor list,
-- and scoping the Vendor master itself by client.
--
-- Two clients now share this portal (Elemento, and a new one being
-- onboarded) — until now, vendors were shared firm-wide across every
-- client, which stops making sense the moment a second client's vendors
-- need to stay separate from the first's.
--
-- Unlike vendors (checker/admin only), Expense Ledger and GST Vendor
-- Master are writable by maker, checker AND admin, per explicit request —
-- these are working reference lists everyone touches, not something that
-- needs the extra control vendor bank details get.

-- ---------------------------------------------------------------------------
-- Vendors: scope by client, not just org.
--
-- Existing vendor rows predate per-client scoping, so client_id starts
-- nullable and is backfilled from each vendor's own review history —
-- a vendor is only ever created by submitReview() against one specific
-- document, so its most recent review names the client it belongs to.
-- Anything still unresolved after that (no review ever pointed at it)
-- falls back to the org's sole client when there's exactly one; with more
-- than one client already on file, this stops and asks for a manual look
-- rather than guessing which one.
-- ---------------------------------------------------------------------------
alter table public.vendors
  add column client_id uuid references public.clients (id);

update public.vendors v
set client_id = sub.client_id
from (
  select distinct on (r.vendor_id) r.vendor_id, d.client_id
  from public.reviews r
  join public.documents d on d.id = r.document_id
  where r.vendor_id is not null
  order by r.vendor_id, r.submitted_at desc
) sub
where v.id = sub.vendor_id
  and v.client_id is null;

do $$
declare
  v_unresolved_count int;
  v_single_client_id uuid;
  v_client_count int;
begin
  select count(*) into v_unresolved_count from public.vendors where client_id is null;
  if v_unresolved_count = 0 then
    return;
  end if;

  select count(*) into v_client_count from public.clients;
  if v_client_count = 1 then
    select id into v_single_client_id from public.clients limit 1;
    update public.vendors set client_id = v_single_client_id where client_id is null;
  else
    raise exception 'Cannot backfill client_id for % vendor(s) with no review history, and more than one client exists — resolve manually (UPDATE vendors SET client_id = ... WHERE client_id IS NULL) before re-running this migration.', v_unresolved_count;
  end if;
end $$;

alter table public.vendors
  alter column client_id set not null;

drop index if exists vendors_org_gstin_idx;
drop index if exists vendors_org_pan_idx;
create index vendors_org_client_gstin_idx on public.vendors (org_id, client_id, gstin);
create index vendors_org_client_pan_idx on public.vendors (org_id, client_id, pan);
create index vendors_client_id_idx on public.vendors (client_id);

-- ---------------------------------------------------------------------------
-- Expense Ledger Master
-- ---------------------------------------------------------------------------
create table public.expense_ledgers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  client_id uuid not null references public.clients (id),
  name text not null,
  category text,
  is_active boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expense_ledgers_client_id_idx on public.expense_ledgers (client_id);
create unique index expense_ledgers_client_name_idx on public.expense_ledgers (client_id, name);

alter table public.expense_ledgers enable row level security;

create policy "members read expense ledgers in own org"
on public.expense_ledgers for select
using (org_id = public.current_org());

create policy "maker checker admin insert expense ledgers in own org"
on public.expense_ledgers for insert
with check (org_id = public.current_org() and public.current_role() in ('maker', 'checker', 'admin'));

create policy "maker checker admin update expense ledgers in own org"
on public.expense_ledgers for update
using (org_id = public.current_org() and public.current_role() in ('maker', 'checker', 'admin'))
with check (org_id = public.current_org());

create or replace function public.handle_expense_ledger_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_expense_ledgers_before_update
before update on public.expense_ledgers
for each row execute function public.handle_expense_ledger_update();

-- ---------------------------------------------------------------------------
-- GST Vendor Master — used to cross-check a GSTIN read off an invoice
-- against a known-good list, per client.
-- ---------------------------------------------------------------------------
create table public.gst_vendor_master (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  client_id uuid not null references public.clients (id),
  gstin text not null,
  party_name text not null,
  is_active boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index gst_vendor_master_client_gstin_idx on public.gst_vendor_master (client_id, gstin);

alter table public.gst_vendor_master enable row level security;

create policy "members read gst vendor master in own org"
on public.gst_vendor_master for select
using (org_id = public.current_org());

create policy "maker checker admin insert gst vendor master in own org"
on public.gst_vendor_master for insert
with check (org_id = public.current_org() and public.current_role() in ('maker', 'checker', 'admin'));

create policy "maker checker admin update gst vendor master in own org"
on public.gst_vendor_master for update
using (org_id = public.current_org() and public.current_role() in ('maker', 'checker', 'admin'))
with check (org_id = public.current_org());

create or replace function public.handle_gst_vendor_master_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_gst_vendor_master_before_update
before update on public.gst_vendor_master
for each row execute function public.handle_gst_vendor_master_update();

-- No delete policy on either table — "delete" is a soft archive via
-- is_active, same as documents, so a row already referenced by a past
-- review is never actually removed out from under it.
