-- Finance Portal — Step 3: AI extraction of invoice fields
-- Each extraction attempt is its own row (never edited or deleted), so the
-- history of what Claude read is preserved the same way everything else in
-- this app is. The document's current status is a cache of the latest
-- attempt, kept in step by a trigger.

alter table public.documents
  add column extraction_status text not null default 'pending'
    check (extraction_status in ('pending', 'completed', 'failed'));

create table public.extractions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id),
  org_id uuid not null references public.organizations (id),
  model text not null,
  status text not null check (status in ('completed', 'failed')),
  fields jsonb,
  flags jsonb not null default '[]',
  error_message text,
  created_at timestamptz not null default now()
);

create index extractions_document_id_idx on public.extractions (document_id, created_at desc);
create index extractions_org_id_idx on public.extractions (org_id);

alter table public.extractions enable row level security;

create policy "members read extractions in own org"
on public.extractions for select
using (org_id = public.current_org());

create policy "members insert extractions in own org"
on public.extractions for insert
with check (org_id = public.current_org());

-- No update/delete policies: a re-run creates a new row instead of
-- overwriting the last attempt.

create or replace function public.handle_extraction_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.documents
  set extraction_status = new.status
  where id = new.document_id;

  insert into public.audit_log (actor_id, actor_email, org_id, action, table_name, record_id, old_value, new_value)
  values (
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    new.org_id,
    case when new.status = 'completed' then 'document.extracted' else 'document.extraction_failed' end,
    'documents',
    new.document_id::text,
    null,
    jsonb_build_object('extraction_id', new.id, 'status', new.status, 'flag_count', jsonb_array_length(new.flags))
  );

  return new;
end;
$$;

create trigger trg_extractions_after_insert
after insert on public.extractions
for each row execute function public.handle_extraction_insert();
