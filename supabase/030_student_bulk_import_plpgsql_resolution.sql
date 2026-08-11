-- QuranOS V2 - make local-variable resolution explicit in import routines.
-- The routines deliberately use local branch_id/class_id variables alongside
-- identically named table columns; PostgreSQL otherwise reports ambiguity.
begin;

alter function public.stage_student_import_batch(uuid, uuid, text, text, jsonb)
  set plpgsql.variable_conflict = 'use_variable';

alter function public.commit_student_import_batch(uuid)
  set plpgsql.variable_conflict = 'use_variable';

commit;
