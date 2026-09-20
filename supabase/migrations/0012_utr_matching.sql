-- Finance Portal — UTR capture from an uploaded bank statement
--
-- SPEC.md: "after payment, the maker uploads the bank's payment status file
-- or statement. The portal matches rows to pending payments by amount,
-- beneficiary account and date, and fills in the UTR." The matching itself
-- (parsing the file, comparing amount/account/date) happens in the
-- application layer — this function only writes the result, the same
-- narrow-gated-write pattern as record_payment() and mark_reviews_exported().

create or replace function public.apply_utr_matches(p_matches jsonb) -- [{ "payment_id": uuid, "utr": text }, ...]
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_org();
  v_match jsonb;
  v_payment_id uuid;
  v_utr text;
  v_old_utr text;
begin
  if p_matches is null or jsonb_array_length(p_matches) = 0 then
    return;
  end if;

  for v_match in select * from jsonb_array_elements(p_matches)
  loop
    v_payment_id := (v_match ->> 'payment_id')::uuid;
    v_utr := nullif(trim(v_match ->> 'utr'), '');

    select utr into v_old_utr from public.payments where id = v_payment_id and org_id = v_org;
    if not found then
      raise exception 'payment % was not found in your organization', v_payment_id;
    end if;

    update public.payments set utr = v_utr where id = v_payment_id;

    insert into public.audit_log (actor_id, actor_email, org_id, action, table_name, record_id, old_value, new_value)
    values (
      auth.uid(), (select email from auth.users where id = auth.uid()), v_org,
      'payment.utr_matched', 'payments', v_payment_id::text,
      jsonb_build_object('utr', v_old_utr), jsonb_build_object('utr', v_utr)
    );
  end loop;
end;
$$;

grant execute on function public.apply_utr_matches(jsonb) to authenticated;
