-- QuranOS V2 - make local-variable resolution explicit in import routines.
--
-- Hosted Supabase does not allow a migration role to persist the custom
-- plpgsql.variable_conflict GUC with ALTER FUNCTION ... SET. PL/pgSQL supports
-- the equivalent per-function compiler directive inside the function body,
-- which keeps the behavior local without requiring a privileged GUC change.
--
-- Preserve the bodies created by Migration 028 and prepend that directive.
begin;

do $student_import_variable_conflict$
declare
  stage_source text;
  commit_source text;
begin
  select procedure.prosrc
    into stage_source
  from pg_proc procedure
  where procedure.oid = to_regprocedure(
    'public.stage_student_import_batch(uuid,uuid,text,text,jsonb)'
  );

  select procedure.prosrc
    into commit_source
  from pg_proc procedure
  where procedure.oid = to_regprocedure(
    'public.commit_student_import_batch(uuid)'
  );

  if stage_source is null or commit_source is null then
    raise exception using
      errcode = '42883',
      message = 'student_import_variable_conflict_target_missing';
  end if;

  if position('#variable_conflict use_variable' in stage_source) = 0 then
    stage_source := E'#variable_conflict use_variable\n' || stage_source;
  end if;

  if position('#variable_conflict use_variable' in commit_source) = 0 then
    commit_source := E'#variable_conflict use_variable\n' || commit_source;
  end if;

  execute format(
    $definition$
      create or replace function public.stage_student_import_batch(
        target_school_id uuid,
        target_actor_id uuid,
        target_file_name text,
        target_file_sha256 text,
        target_rows jsonb
      )
      returns uuid
      language plpgsql
      volatile
      security definer
      set search_path = ''
      as %L
    $definition$,
    stage_source
  );

  execute format(
    $definition$
      create or replace function public.commit_student_import_batch(
        target_batch_id uuid
      )
      returns integer
      language plpgsql
      volatile
      security definer
      set search_path = ''
      as %L
    $definition$,
    commit_source
  );
end;
$student_import_variable_conflict$;

-- Reassert the narrow browser/service exposure after CREATE OR REPLACE.
revoke all on function public.stage_student_import_batch(uuid, uuid, text, text, jsonb)
from public, anon, authenticated;
grant execute on function public.stage_student_import_batch(uuid, uuid, text, text, jsonb)
to service_role;

revoke all on function public.commit_student_import_batch(uuid)
from public, anon;
grant execute on function public.commit_student_import_batch(uuid)
to authenticated;

-- Guard against accidentally reintroducing a hosted-incompatible function GUC.
do $student_import_variable_conflict_guard$
begin
  if exists (
    select 1
    from pg_proc procedure
    where procedure.oid in (
      to_regprocedure('public.stage_student_import_batch(uuid,uuid,text,text,jsonb)'),
      to_regprocedure('public.commit_student_import_batch(uuid)')
    )
      and coalesce(procedure.proconfig, '{}'::text[])
          && array['plpgsql.variable_conflict=use_variable']::text[]
  ) then
    raise exception using
      errcode = '42501',
      message = 'student_import_hosted_incompatible_variable_conflict_guc';
  end if;
end;
$student_import_variable_conflict_guard$;

commit;
