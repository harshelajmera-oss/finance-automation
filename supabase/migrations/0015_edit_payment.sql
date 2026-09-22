-- Finance Portal — correcting a payment record after entry
--
-- A payment's header details (date, mode, UTR, reference, paid-from ledger,
-- proof link, advance flag, notes) sometimes get typed wrong and need
-- fixing without re-entering the whole payment. This deliberately does NOT
-- let the amount or which reviews it covers change — that's a re-derivation
-- of the gross/TDS/net split and the outstanding-balance math elsewhere in
-- the app, not a data-entry correction. Same narrow-gated-write pattern as
-- record_payment() and apply_utr_matches(): the RPC does the write and logs
-- old/new values, application code never writes these tables directly.

create or replace function public.edit_payment(
  p_payment_id uuid,
  p_payment_date date,
  p_mode text,
  p_utr text,
  p_reference text,
  p_paid_from_ledger text,
  p_proof_url text,
  p_is_advance boolean,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_org();
  v_old record;
begin
  if v_org is null then
    raise exception 'no organization for the current user';
  end if;

  select * into v_old from public.payments where id = p_payment_id and org_id = v_org;
  if not found then
    raise exception 'payment % was not found in your organization', p_payment_id;
  end if;

  update public.payments set
    payment_date = p_payment_date,
    mode = p_mode,
    utr = nullif(trim(p_utr), ''),
    reference = nullif(trim(p_reference), ''),
    paid_from_ledger = nullif(trim(p_paid_from_ledger), ''),
    proof_url = nullif(trim(p_proof_url), ''),
    is_advance = coalesce(p_is_advance, false),
    notes = nullif(trim(p_notes), '')
  where id = p_payment_id;

  insert into public.audit_log (actor_id, actor_email, org_id, action, table_name, record_id, old_value, new_value)
  values (
    auth.uid(), (select email from auth.users where id = auth.uid()), v_org,
    'payment.edited', 'payments', p_payment_id::text,
    jsonb_build_object(
      'payment_date', v_old.payment_date, 'mode', v_old.mode, 'utr', v_old.utr, 'reference', v_old.reference,
      'paid_from_ledger', v_old.paid_from_ledger, 'proof_url', v_old.proof_url, 'is_advance', v_old.is_advance,
      'notes', v_old.notes
    ),
    jsonb_build_object(
      'payment_date', p_payment_date, 'mode', p_mode, 'utr', p_utr, 'reference', p_reference,
      'paid_from_ledger', p_paid_from_ledger, 'proof_url', p_proof_url, 'is_advance', p_is_advance, 'notes', p_notes
    )
  );
end;
$$;

grant execute on function public.edit_payment(uuid, date, text, text, text, text, text, boolean, text) to authenticated;
