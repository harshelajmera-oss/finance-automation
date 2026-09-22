-- Finance Portal — a recommended TDS code/rate set once when a vendor is
-- onboarded (admin's vendor edit screen), used as the starting suggestion
-- for that vendor's very first invoice.
--
-- vendors.last_tds_code / last_tds_rate already exist and are updated
-- automatically from whatever was actually used on the vendor's most
-- recent invoice — but a brand-new vendor has no "last" yet, so the TDS
-- code/rate field on their first invoice starts blank today. These two
-- columns are the admin's own one-time recommendation instead, used only
-- as a fallback when there's no history yet (see initRowState() in
-- document-grid.tsx and review-form.tsx) — still fully editable on every
-- invoice, same as last_tds_code/rate always were.

alter table public.vendors add column default_tds_code text;
alter table public.vendors add column default_tds_rate numeric;
