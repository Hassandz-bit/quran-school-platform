-- QuranOS student profile browser privileges for columns introduced by Migration 021.
-- RLS and students.manage remain authoritative; this only extends the existing
-- column-level privilege model from Migration 004.

grant insert (education_year)
  on public.students to authenticated;

grant update (education_year, photo_path)
  on public.students to authenticated;
