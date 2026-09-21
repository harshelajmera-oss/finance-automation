-- Finance Portal — per-client masters: Expense Ledger, GST Vendor list,
-- and scoping the Vendor master itself by client.
--
-- Two clients now share this portal (Elemento, and a new one being
-- onboarded) — until now, vendors were shared firm-wide across every
-- client, which stops making sense the moment a second client's vendors
-- need to stay separate from the first's. The vendors table happens to be
-- empty right now (cleared before go-live), so client_id can be added as
-- NOT NULL with no backfill to worry about.
--
-- Unlike vendors (checker/admin only), Expense Ledger and GST Vendor
-- Master are writable by maker, checker AND admin, per explicit request —
-- these are working reference lists everyone touches, not something that
-- needs the extra control vendor bank details get.

-- ---------------------------------------------------------------------------
-- Vendors: scope by client, not just org.
-- ---------------------------------------------------------------------------
alter table public.vendors
  add column client_id uuid not null references public.clients (id);

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
