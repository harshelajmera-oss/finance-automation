-- Finance Portal — track what's already been downloaded from "Approved"
--
-- Without this, downloading the Approved list's Excel export always
-- includes every approved item ever, so uploading 10 more invoices next
-- week means re-downloading everything from before too. This records when
-- a review was last included in an export, so the Approved screen can
-- default to "only what hasn't been downloaded yet."

alter table public.reviews
  add column exported_at timestamptz;

-- Every role that can see the Approved list (maker, checker, admin) needs to
-- be able to mark rows as downloaded, but the only update policy on
-- `reviews` is the checker's approve/reject one. Rather than opening up
-- general updates, this function does exactly one narrow thing — and only
-- to rows already approved, in the caller's own org.
create or replace function public.mark_reviews_exported(review_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reviews
  set exported_at = now()
  where id = any(review_ids)
    and org_id = public.current_org()
    and status = 'approved';
end;
$$;

grant execute on function public.mark_reviews_exported(uuid[]) to authenticated;
