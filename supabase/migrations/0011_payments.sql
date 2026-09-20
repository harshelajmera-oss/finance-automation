-- Finance Portal — Step 5: payment records
--
-- SPEC.md's Payments section: "the portal prepares the payment file and
-- records what was paid; the checker still releases money on the bank or
-- Razorpay with OTP." The Razorpay payout file (application code only, no
-- migration needed) covers the first half. This covers the second: a
-- payment record, one per actual payment,
-- linked to one or more approved reviews — supporting a single payment
-- covering several invoices, and a single invoice paid across more than one
-- payment (part-payments). The money math (gross/TDS/net split per
-- allocation, what's still outstanding on a review) is worked out in the
-- application layer, same as the rest of this codebase's approach to
-- SECURITY DEFINER functions — this migration only gates and records the
-- write, it does not re-derive figures the app already computed.
--
-- Deliberately not covered here, left for a later step:
--   - UTR auto-matching against an uploaded bank statement (spec allows
--     manual UTR entry, which this does support).
--   - TDS-recoverable ageing report for "pay gross and recover" vendors.
--   - Recording an advance paid before any invoice/review exists at all —
--     `is_advance` only relaxes the payment-date-vs-invoice-date check for
--     an advance against a review that already exists.

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  payment_date date not null,
  mode text not null check (mode in ('neft', 'rtgs', 'imps', 'upi', 'card', 'auto_debit', 'employee_paid')),
  utr text,
  reference text,
  paid_from_ledger text,
  proof_url text,
  is_advance boolean not null default false,
  notes text,
  gross_amount numeric not null,
  tds_amount numeric not null default 0,
  net_amount numeric not null,
  recorded_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index payments_org_id_idx on public.payments (org_id, payment_date desc);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  review_id uuid not null references public.reviews (id),
  amount numeric not null,
  gross_amount numeric not null,
  tds_amount numeric not null default 0
);

create index payment_allocations_payment_id_idx on public.payment_allocations (payment_id);
create index payment_allocations_review_id_idx on public.payment_allocations (review_id);

alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;

create policy "members read payments in own org"
on public.payments for select
using (org_id = public.current_org());

create policy "members read payment allocations in own org"
on public.payment_allocations for select
using (exists (
  select 1 from public.payments p where p.id = payment_allocations.payment_id and p.org_id = public.current_org()
));

-- No insert/update/delete policies for client roles on either table: rows
-- are written only through record_payment() below, which runs as the table
-- owner and applies its own authorization and validation.

create or replace function public.record_payment(
  p_payment_date date,
  p_mode text,
  p_utr text,
  p_reference text,
  p_paid_from_ledger text,
  p_proof_url text,
  p_is_advance boolean,
  p_notes text,
  p_allocations jsonb -- [{ "review_id": uuid, "amount": numeric, "gross_amount": numeric, "tds_amount": numeric }, ...]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_org();
  v_payment_id uuid;
  v_gross numeric := 0;
  v_tds numeric := 0;
  v_net numeric := 0;
  v_alloc jsonb;
  v_review_id uuid;
  v_amount numeric;
  v_alloc_gross numeric;
  v_alloc_tds numeric;
  v_review_status text;
  v_invoice_date date;
  v_earliest_invoice_date date;
begin
  if v_org is null then
    raise exception 'no organization for the current user';
  end if;

  if p_allocations is null or jsonb_array_length(p_allocations) = 0 then
    raise exception 'select at least one approved item to record a payment against';
  end if;

  for v_alloc in select * from jsonb_array_elements(p_allocations)
  loop
    v_review_id := (v_alloc ->> 'review_id')::uuid;
    v_amount := (v_alloc ->> 'amount')::numeric;
    v_alloc_gross := (v_alloc ->> 'gross_amount')::numeric;
    v_alloc_tds := coalesce((v_alloc ->> 'tds_amount')::numeric, 0);

    if v_amount is null or v_amount <= 0 then
      raise exception 'each allocation needs a positive amount';
    end if;

    select r.status,
           (coalesce(r.checker_edited_fields, r.reviewed_fields) -> 'document' ->> 'invoice_date')::date
      into v_review_status, v_invoice_date
      from public.reviews r
      where r.id = v_review_id and r.org_id = v_org;

    if not found then
      raise exception 'review % was not found in your organization', v_review_id;
    end if;
    if v_review_status <> 'approved' then
      raise exception 'review % is not approved — only approved items can be paid', v_review_id;
    end if;

    if v_invoice_date is not null and (v_earliest_invoice_date is null or v_invoice_date < v_earliest_invoice_date) then
      v_earliest_invoice_date := v_invoice_date;
    end if;

    v_net := v_net + v_amount;
    v_gross := v_gross + coalesce(v_alloc_gross, v_amount);
    v_tds := v_tds + v_alloc_tds;
  end loop;

  if not p_is_advance and v_earliest_invoice_date is not null and p_payment_date < v_earliest_invoice_date then
    raise exception 'payment date cannot be before the invoice date unless marked as an advance';
  end if;

  insert into public.payments (
    org_id, payment_date, mode, utr, reference, paid_from_ledger, proof_url, is_advance, notes,
    gross_amount, tds_amount, net_amount, recorded_by
  )
  values (
    v_org, p_payment_date, p_mode, nullif(trim(p_utr), ''), nullif(trim(p_reference), ''),
    nullif(trim(p_paid_from_ledger), ''), nullif(trim(p_proof_url), ''), coalesce(p_is_advance, false),
    nullif(trim(p_notes), ''), v_gross, v_tds, v_net, auth.uid()
  )
  returning id into v_payment_id;

  for v_alloc in select * from jsonb_array_elements(p_allocations)
  loop
    insert into public.payment_allocations (payment_id, review_id, amount, gross_amount, tds_amount)
    values (
      v_payment_id,
      (v_alloc ->> 'review_id')::uuid,
      (v_alloc ->> 'amount')::numeric,
      coalesce((v_alloc ->> 'gross_amount')::numeric, (v_alloc ->> 'amount')::numeric),
      coalesce((v_alloc ->> 'tds_amount')::numeric, 0)
    );
  end loop;

  insert into public.audit_log (actor_id, actor_email, org_id, action, table_name, record_id, old_value, new_value)
  values (
    auth.uid(), (select email from auth.users where id = auth.uid()), v_org,
    'payment.recorded', 'payments', v_payment_id::text, null,
    jsonb_build_object(
      'mode', p_mode, 'utr', p_utr, 'reference', p_reference, 'is_advance', p_is_advance,
      'gross_amount', v_gross, 'tds_amount', v_tds, 'net_amount', v_net, 'allocations', p_allocations
    )
  );

  return v_payment_id;
end;
$$;

grant execute on function public.record_payment(date, text, text, text, text, text, boolean, text, jsonb) to authenticated;
