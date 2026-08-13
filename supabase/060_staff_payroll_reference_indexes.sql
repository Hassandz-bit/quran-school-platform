-- QuranOS V2 - employee directory reference indexes
-- V2 only. Production remains unchanged until the release gate is approved.

begin;

create index employees_linked_profile_idx
  on public.employees (linked_profile_id)
  where linked_profile_id is not null;

create index employees_created_by_idx
  on public.employees (created_by);

commit;
