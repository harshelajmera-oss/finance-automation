-- Finance Portal — checker sign-off for GST Vendor Master entries proposed
-- inline (from a "vendor GSTIN not in master" flag while reviewing/approving
-- a document), as opposed to entries added deliberately from the GST Vendor
-- Master admin page itself.
--
-- `is_approved` defaults to true so every existing row, and every row still
-- added directly from the admin page (addGstVendor / uploadGstVendors —
-- unchanged, no approval step there, same as before this migration), stays
-- immediately live. Only the new inline "propose" action inserts a row with
-- is_approved = false; fetchGstVendorMaster() and checkGstin() both filter
-- on it by default, so a proposed-but-unapproved GSTIN doesn't silently
-- count as "in the master" — the live GSTIN badge and the extraction-time
-- validation flag both stay exactly as they were before this migration.

alter table public.gst_vendor_master add column is_approved boolean not null default true;
