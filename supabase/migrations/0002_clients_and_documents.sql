-- Finance Portal — Step 2 (partial): clients, document intake, storage
-- Covers manual upload, Client/FY/Month filing, and exact-file duplicate
-- detection. Email intake and Google Drive filing are added once that
-- external connection is set up.

-- ---------------------------------------------------------------------------
-- Clients
-- The firm's own clients (e.g. Elemento Learning Technologies) whose
-- payables this portal manages — not to be confused with `organizations`,
-- which is the firm itself.
-- ---------------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  name text not null,
  code text not null,
  gstin text,
  created_at timestamptz not null default now()
);

create unique index clients_org_id_code_idx on public.clients (org_id, code);
create index clients_org_id_idx on public.clients (org_id);

alter table public.clients enable row level security;

create policy "members read clients in own org"
on public.clients for select
using (org_id = public.current_org());

create policy "admins insert clients in own org"
on public.clients for insert
with check (org_id = public.current_org() and public.current_role() = 'admin');

create policy "admins update clients in own org"
on public.clients for update
using (org_id = public.current_org() and public.current_role() = 'admin')
with check (org_id = public.current_org());

-- No delete policy: clients are not removed once created.

create or replace function public.handle_client_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (actor_id, actor_email, org_id, action, table_name, record_id, old_value, new_value)
    values (
      auth.uid(),
      (select email from auth.users where id = auth.uid()),
      new.org_id,
      'client.created',
      'clients',
      new.id::text,
      null,
      jsonb_build_object('name', new.name, 'code', new.code, 'gstin', new.gstin)
    );
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_log (actor_id, actor_email, org_id, action, table_name, record_id, old_value, new_value)
    values (
      auth.uid(),
      (select email from auth.users where id = auth.uid()),
      new.org_id,
      'client.updated',
      'clients',
      new.id::text,
      jsonb_build_object('name', old.name, 'code', old.code, 'gstin', old.gstin),
      jsonb_build_object('name', new.name, 'code', new.code, 'gstin', new.gstin)
    );
    return new;
  end if;
  return new;
end;
$$;

create trigger trg_clients_after_insert
after insert on public.clients
for each row execute function public.handle_client_change();

create trigger trg_clients_after_update
after update on public.clients
for each row execute function public.handle_client_change();

-- ---------------------------------------------------------------------------
-- Documents
-- One row per received file (upload today; email intake later). Filing uses
-- the date RECEIVED, matching the spec ("Month = month the document was
-- received") — the final vendor/invoice-based filename comes after AI
-- extraction in a later step.
-- ---------------------------------------------------------------------------
create type public.document_status as enum ('received', 'duplicate');

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  client_id uuid not null references public.clients (id),
  uploaded_by uuid references auth.users (id),
  source text not null default 'upload',
  original_filename text not null,
  storage_path text not null,
  file_hash text not null,
  file_size bigint not null,
  received_at timestamptz not null default now(),
  fiscal_year text not null,
  received_month text not null,
  status public.document_status not null default 'received',
  duplicate_of uuid references public.documents (id),
  created_at timestamptz not null default now()
);

create index documents_org_id_idx on public.documents (org_id);
create index documents_client_id_idx on public.documents (client_id);
create index documents_org_id_file_hash_idx on public.documents (org_id, file_hash);

alter table public.documents enable row level security;

create policy "members read documents in own org"
on public.documents for select
using (org_id = public.current_org());

create policy "members insert documents in own org"
on public.documents for insert
with check (org_id = public.current_org() and uploaded_by = auth.uid());

-- No update/delete policies: a filed document is never edited or removed
-- here — corrections happen through the maker/checker flow in a later step,
-- and duplicates are linked via duplicate_of, never deleted.

create or replace function public.handle_document_insert()
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
    case when new.status = 'duplicate' then 'document.duplicate_detected' else 'document.uploaded' end,
    'documents',
    new.id::text,
    null,
    jsonb_build_object(
      'client_id', new.client_id,
      'original_filename', new.original_filename,
      'status', new.status,
      'duplicate_of', new.duplicate_of
    )
  );
  return new;
end;
$$;

create trigger trg_documents_after_insert
after insert on public.documents
for each row execute function public.handle_document_insert();

-- ---------------------------------------------------------------------------
-- Storage
-- Files live in a private "documents" bucket, at
-- <org_id>/<client_code>/<fiscal_year>/<month>/<document_id>-<filename>,
-- so the same org-scoping used everywhere else also applies to file access.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "members read own org documents in storage"
on storage.objects for select
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = public.current_org()::text
);

create policy "members upload to own org documents in storage"
on storage.objects for insert
with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = public.current_org()::text
);
