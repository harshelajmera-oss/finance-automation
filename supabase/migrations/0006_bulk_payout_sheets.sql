-- Finance Portal — bulk payout sheet ingestion
--
-- A payout sheet (many payees, no invoices — mentor payouts and similar)
-- doesn't go through AI extraction like a normal invoice. Instead the sheet
-- is parsed deterministically and each payee row becomes its own ordinary
-- document + extraction, so it flows through the exact same maker/checker/
-- vendor-master/approved pipeline everything else does. The physical file
-- is stored once per sheet (in `payout_batches`); each row's `documents`
-- row points at that same stored file and records which row it came from.

create table public.payout_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  client_id uuid not null references public.clients (id),
  uploaded_by uuid references auth.users (id),
  original_filename text not null,
  storage_path text not null,
  file_hash text not null,
  row_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index payout_batches_org_id_idx on public.payout_batches (org_id);
create index payout_batches_org_id_file_hash_idx on public.payout_batches (org_id, file_hash);

alter table public.payout_batches enable row level security;

create policy "members read payout batches in own org"
on public.payout_batches for select
using (org_id = public.current_org());

create policy "members insert payout batches in own org"
on public.payout_batches for insert
with check (org_id = public.current_org() and uploaded_by = auth.uid());

-- No update/delete: a batch, once imported, stays on record like everything else.

create or replace function public.handle_payout_batch_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (actor_id, actor_email, org_id, action, table_name, record_id, old_value, new_value)
  values (
    new.uploaded_by,
    (select email from auth.users where id = new.uploaded_by),
    new.org_id,
    'payout_batch.imported',
    'payout_batches',
    new.id::text,
    null,
    jsonb_build_object('original_filename', new.original_filename, 'row_count', new.row_count)
  );
  return new;
end;
$$;

create trigger trg_payout_batches_after_insert
after insert on public.payout_batches
for each row execute function public.handle_payout_batch_insert();

-- Each payee row is an ordinary document, tagged back to its batch and row
-- number. file_hash on these rows is "<sheet hash>:<row index>" rather than
-- a hash of file bytes, so re-importing the same physical sheet is still
-- caught (at the payout_batches level, by file_hash) without every row in
-- one sheet falsely tripping the single-document duplicate check.
alter table public.documents
  add column payout_batch_id uuid references public.payout_batches (id),
  add column payout_row_index integer;

create index documents_payout_batch_id_idx on public.documents (payout_batch_id);
