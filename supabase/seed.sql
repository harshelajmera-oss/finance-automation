-- Run once after 0001_init.sql, on a fresh project, to create the firm's
-- organization row. New users created without an explicit org_id in their
-- metadata are attached to the first organization created, so keep this to
-- one row until multi-firm support is actually needed.
insert into public.organizations (name)
values ('Jhawar Mantri & Associates');
