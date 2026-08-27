-- Step 6: real RLS policies now that there is an authenticated user.
--
-- Until now the table had RLS enabled with zero policies, and everything read
-- it server-side with the service_role key. From here the dashboard reads as
-- the logged-in user, so the anon/authenticated role needs explicit grants.
--
-- This is a single-operator CRM: any authenticated user is the operator.
-- If this ever becomes multi-tenant, these policies are where an owner_id
-- check goes. Anonymous users still get nothing.

create policy "authenticated users can read enquiries"
  on public.enquiries for select
  to authenticated
  using (true);

create policy "authenticated users can update enquiries"
  on public.enquiries for update
  to authenticated
  using (true)
  with check (true);

-- Deliberately no INSERT or DELETE policy for authenticated users. Rows are
-- created only by the inbound webhook via service_role, which bypasses RLS.
-- Nothing in the UI should be able to fabricate an enquiry.

create policy "authenticated users can read usage"
  on public.claude_usage for select
  to authenticated
  using (true);
