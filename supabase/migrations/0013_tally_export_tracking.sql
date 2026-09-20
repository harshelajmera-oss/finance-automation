-- Finance Portal — Step 6: Tally export tracking (ledger creation + purchase vouchers)
--
-- SPEC.md's Outputs section: "Each file is logged with who generated it and
-- which documents it contains; a document cannot be exported twice without
-- an admin override." The "logged" half reuses the existing audit_log
-- table (action 'tally.ledger_export' / 'tally.purchase_voucher_export')
-- rather than a new table. The "cannot be exported twice" half needs one
-- timestamp each on vendors and reviews, plus a narrow function to set it —
-- same SECURITY DEFINER gated-write pattern as mark_reviews_exported().

alter table public.vendors
  add column tally_exported_at timestamptz;

alter table public.reviews
  add column tally_exported_at timestamptz;

create or replace function public.mark_vendors_tally_exported(vendor_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.vendors
  set tally_exported_at = now()
  where id = any(vendor_ids)
    and org_id = public.current_org();

  insert into public.audit_log (actor_id, actor_email, org_id, action, table_name, record_id, old_value, new_value)
  values (
    auth.uid(), (select email from auth.users where id = auth.uid()), public.current_org(),
    'tally.ledger_export', 'vendors', array_to_string(vendor_ids, ','), null,
    jsonb_build_object('vendor_ids', vendor_ids)
  );
end;
$$;

grant execute on function public.mark_vendors_tally_exported(uuid[]) to authenticated;

create or replace function public.mark_reviews_tally_exported(review_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reviews
  set tally_exported_at = now()
  where id = any(review_ids)
    and org_id = public.current_org()
    and status = 'approved';

  insert into public.audit_log (actor_id, actor_email, org_id, action, table_name, record_id, old_value, new_value)
  values (
    auth.uid(), (select email from auth.users where id = auth.uid()), public.current_org(),
    'tally.purchase_voucher_export', 'reviews', array_to_string(review_ids, ','), null,
    jsonb_build_object('review_ids', review_ids)
  );
end;
$$;

grant execute on function public.mark_reviews_tally_exported(uuid[]) to authenticated;
