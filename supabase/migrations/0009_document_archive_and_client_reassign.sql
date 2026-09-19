-- Finance Portal — archive (soft-delete) and client reassignment for documents
--
-- Documents are otherwise never edited or deleted, by design — everything
-- else in this app is an append-only record so the audit trail can't have
-- gaps. A wrongly-uploaded document (wrong client, wrong file, a duplicate
-- upload) still needs a way to be corrected without breaking that
-- guarantee: archiving hides it from the normal lists but keeps the row,
-- its file and every linked extraction/review in the database, restorable,
-- and every change is logged like anything else here. True deletion is
-- deliberately not offered.

alter table public.documents
  add column archived_at timestamptz,
  add column archived_by uuid references auth.users (id);

create index documents_archived_at_idx on public.documents (archived_at);

-- The only existing update path on `documents` is none at all — this is the
-- first. Scoped to admins, and to the two fields this is actually for;
-- application code decides which of archived_at/client_id it touches per
-- call, but nothing stops an admin from being able to update either.
create policy "admins update documents in own org"
on public.documents for update
using (org_id = public.current_org() and public.current_role() = 'admin')
with check (org_id = public.current_org());

create or replace function public.handle_document_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.archived_at is distinct from new.archived_at then
    insert into public.audit_log (actor_id, actor_email, org_id, action, table_name, record_id, old_value, new_value)
    values (
      auth.uid(), (select email from auth.users where id = auth.uid()), new.org_id,
      case when new.archived_at is not null then 'document.archived' else 'document.restored' end,
      'documents', new.id::text,
      jsonb_build_object('archived_at', old.archived_at),
      jsonb_build_object('archived_at', new.archived_at)
    );
  end if;

  if old.client_id is distinct from new.client_id then
    insert into public.audit_log (actor_id, actor_email, org_id, action, table_name, record_id, old_value, new_value)
    values (
      auth.uid(), (select email from auth.users where id = auth.uid()), new.org_id,
      'document.client_reassigned', 'documents', new.id::text,
      jsonb_build_object('client_id', old.client_id),
      jsonb_build_object('client_id', new.client_id)
    );
  end if;

  return new;
end;
$$;

create trigger trg_documents_before_update
before update on public.documents
for each row execute function public.handle_document_update();
