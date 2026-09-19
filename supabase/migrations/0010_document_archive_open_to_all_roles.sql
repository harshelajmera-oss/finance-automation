-- Finance Portal — archive/edit a document: any signed-in team member, not just admins
--
-- 0009 scoped archiving and client-reassignment to admins only. In practice
-- a maker who uploaded to the wrong client, or a checker who spots someone
-- else's mistake, needs the same ability — matching the "checker can edit
-- anything" trust model already used elsewhere in this app. Every change
-- still goes through the same audit trigger from 0009, so who did what is
-- never lost.

drop policy "admins update documents in own org" on public.documents;

create policy "members update documents in own org"
on public.documents for update
using (org_id = public.current_org())
with check (org_id = public.current_org());
