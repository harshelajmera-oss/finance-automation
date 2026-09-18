-- Finance Portal — Step 1: organizations, profiles (roles), audit log
-- Run this once in the Supabase SQL Editor (or via `supabase db push`) on a fresh project.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('maker', 'checker', 'admin');

-- ---------------------------------------------------------------------------
-- Organizations
-- Phase 1 has a single firm, but the spec calls for each organisation's data
-- to be walled off from every other's from day one, so tenancy is modelled
-- now rather than retrofitted later.
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Profiles
-- One row per Supabase Auth user. Holds the role and organization used by
-- every later step (documents, approvals, payments) to decide who can do what.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references public.organizations (id),
  email text not null,
  full_name text,
  role public.user_role not null default 'maker',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_org_id_idx on public.profiles (org_id);

-- ---------------------------------------------------------------------------
-- Audit log
-- Append-only: every action is recorded with who, when, old value, new value.
-- No update or delete path exists for any role, including the service role
-- used by the backend, so log rows cannot be edited or removed by the app,
-- an admin, or a bug.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid references auth.users (id),
  actor_email text,
  org_id uuid references public.organizations (id),
  action text not null,
  table_name text not null,
  record_id text not null,
  old_value jsonb,
  new_value jsonb
);

create index audit_log_org_id_occurred_at_idx on public.audit_log (org_id, occurred_at desc);

-- Belt and suspenders: even a database superuser session using the app's
-- normal roles cannot UPDATE or DELETE audit_log rows. Inserts still work
-- because they go through the SECURITY DEFINER trigger functions below,
-- which run as the table owner.
revoke update, delete on public.audit_log from public, anon, authenticated, service_role;

create or replace function public.audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log rows cannot be updated or deleted';
end;
$$;

create trigger trg_audit_log_no_update
before update on public.audit_log
for each row execute function public.audit_log_immutable();

create trigger trg_audit_log_no_delete
before delete on public.audit_log
for each row execute function public.audit_log_immutable();

-- ---------------------------------------------------------------------------
-- New auth user -> profile row + audit entry
-- The admin creates users via the Supabase Admin API (see the "Add a new
-- user" screen), passing the intended role and org_id as user metadata.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org_id uuid;
begin
  target_org_id := nullif(new.raw_user_meta_data ->> 'org_id', '')::uuid;

  if target_org_id is null then
    select id into target_org_id from public.organizations order by created_at limit 1;
  end if;

  insert into public.profiles (id, org_id, email, full_name, role)
  values (
    new.id,
    target_org_id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'maker')
  );

  insert into public.audit_log (actor_id, actor_email, org_id, action, table_name, record_id, old_value, new_value)
  values (
    new.id,
    new.email,
    target_org_id,
    'profile.created',
    'profiles',
    new.id::text,
    null,
    jsonb_build_object(
      'email', new.email,
      'role', coalesce(new.raw_user_meta_data ->> 'role', 'maker')
    )
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Profile changes (role, active flag) -> audit entry
-- ---------------------------------------------------------------------------
create or replace function public.handle_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role is distinct from new.role or old.is_active is distinct from new.is_active then
    insert into public.audit_log (actor_id, actor_email, org_id, action, table_name, record_id, old_value, new_value)
    values (
      auth.uid(),
      (select email from auth.users where id = auth.uid()),
      new.org_id,
      'profile.updated',
      'profiles',
      new.id::text,
      jsonb_build_object('role', old.role, 'is_active', old.is_active),
      jsonb_build_object('role', new.role, 'is_active', new.is_active)
    );
  end if;

  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_before_update
before update on public.profiles
for each row execute function public.handle_profile_update();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.audit_log enable row level security;

-- Helper functions run as SECURITY DEFINER so they can read profiles without
-- being blocked by the very policies that call them (no recursion).
create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_org()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid();
$$;

create policy "members read own organization"
on public.organizations for select
using (id = public.current_org());

create policy "members read profiles in own org"
on public.profiles for select
using (org_id = public.current_org());

create policy "admins update profiles in own org"
on public.profiles for update
using (org_id = public.current_org() and public.current_role() = 'admin')
with check (org_id = public.current_org());

-- No insert/delete policies on profiles: rows are created only by the
-- handle_new_user trigger and never deleted (deactivate via is_active instead).

create policy "admins read audit log for own org"
on public.audit_log for select
using (org_id = public.current_org() and public.current_role() = 'admin');

-- No insert/update/delete policies for client roles on audit_log: rows are
-- written only by the SECURITY DEFINER trigger functions above.
