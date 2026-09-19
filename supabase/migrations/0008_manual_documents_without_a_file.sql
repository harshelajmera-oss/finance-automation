-- Finance Portal — manual entry with no file attached
--
-- Until now every document row was assumed to have a real stored file:
-- storage_path/file_hash/file_size were all `not null`. Manual entry could
-- only be reached after uploading something first (even a throwaway file),
-- because there was nowhere to attach a fields record without a document
-- row to hang it off. This makes those three columns nullable so a maker
-- can start manual entry directly from the Upload page — no file, nothing
-- to extract, straight to typing in what's on the invoice.

alter table public.documents
  alter column storage_path drop not null,
  alter column file_hash drop not null,
  alter column file_size drop not null;
