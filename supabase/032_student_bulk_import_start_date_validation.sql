-- QuranOS V2 - harden optional start-date validation and same-file duplicate handling.
-- Keeps malformed registration dates row-scoped and ensures only eligible earlier rows reserve an identity in preview.
begin;

create or replace function public.student_import_optional_date_is_valid(target_value text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  parsed_value date;
begin
  if btrim(coalesce(target_value, '')) = '' then
    return true;
  end if;

  if target_value !~ '^\d{4}-\d{2}-\d{2}$' then
    return false;
  end if;

  begin
    parsed_value := target_value::date;
  exception when others then
    return false;
  end;

  return parsed_value is not null;
end;
$$;

revoke all on function public.student_import_optional_date_is_valid(text)
from public, anon, authenticated, service_role;

alter function public.stage_student_import_batch(uuid, uuid, text, text, jsonb)
rename to stage_student_import_batch_unchecked;

revoke all on function public.stage_student_import_batch_unchecked(uuid, uuid, text, text, jsonb)
from public, anon, authenticated, service_role;

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
as $$
declare
  staged_batch_id uuid;
begin
  staged_batch_id := public.stage_student_import_batch_unchecked(
    target_school_id,
    target_actor_id,
    target_file_name,
    target_file_sha256,
    target_rows
  );

  -- Migration 028 marked same-file national-ID duplicates against any earlier row,
  -- including rows that were already errors. Restore those null-target duplicates first;
  -- true database duplicates retain duplicate_student_id and remain duplicates.
  update public.student_import_rows row
  set issues = array_remove(row.issues, 'duplicate_student'),
      row_status = case
        when array_remove(row.issues, 'duplicate_student') && array[
          'branch_not_found','branch_permission_denied','class_not_found','first_name_invalid',
          'last_name_invalid','birth_date_invalid','gender_invalid','guardian_name_invalid',
          'guardian_relation_invalid','guardian_phone_invalid','start_date_invalid'
        ] then 'error'
        when 'class_unassigned' = any(array_remove(row.issues, 'duplicate_student')) then 'warning'
        else 'ready'
      end,
      duplicate_student_id = null
  where row.batch_id = staged_batch_id
    and row.row_status = 'duplicate'
    and row.duplicate_student_id is null;

  update public.student_import_rows row
  set row_status = 'error',
      issues = case
        when 'start_date_invalid' = any(row.issues) then row.issues
        else array_append(row.issues, 'start_date_invalid')
      end
  where row.batch_id = staged_batch_id
    and row.row_status in ('ready', 'warning', 'error')
    and not public.student_import_optional_date_is_valid(row.payload->>'start_date');

  -- Only a prior row that is itself eligible for commit may reserve an identity.
  -- Detect both national-ID and identity-tuple duplicates inside the workbook.
  update public.student_import_rows candidate
  set row_status = 'duplicate',
      issues = case
        when 'duplicate_student' = any(candidate.issues) then candidate.issues
        else array_append(candidate.issues, 'duplicate_student')
      end,
      duplicate_student_id = null
  where candidate.batch_id = staged_batch_id
    and candidate.row_status in ('ready', 'warning')
    and exists (
      select 1
      from public.student_import_rows prior
      where prior.batch_id = candidate.batch_id
        and prior.row_number < candidate.row_number
        and prior.row_status in ('ready', 'warning')
        and (
          (
            nullif(btrim(prior.payload->>'national_id'), '') is not null
            and nullif(btrim(candidate.payload->>'national_id'), '') is not null
            and btrim(prior.payload->>'national_id') = btrim(candidate.payload->>'national_id')
          )
          or (
            lower(btrim(prior.payload->>'first_name')) = lower(btrim(candidate.payload->>'first_name'))
            and lower(btrim(prior.payload->>'last_name')) = lower(btrim(candidate.payload->>'last_name'))
            and btrim(prior.payload->>'birth_date') = btrim(candidate.payload->>'birth_date')
            and regexp_replace(btrim(prior.payload->>'guardian_phone'), '\s+', '', 'g') =
                regexp_replace(btrim(candidate.payload->>'guardian_phone'), '\s+', '', 'g')
          )
        )
    );

  update public.student_import_batches batch
  set ready_count = (select count(*) from public.student_import_rows r where r.batch_id = batch.id and r.row_status = 'ready'),
      warning_count = (select count(*) from public.student_import_rows r where r.batch_id = batch.id and r.row_status = 'warning'),
      duplicate_count = (select count(*) from public.student_import_rows r where r.batch_id = batch.id and r.row_status = 'duplicate'),
      error_count = (select count(*) from public.student_import_rows r where r.batch_id = batch.id and r.row_status = 'error')
  where batch.id = staged_batch_id;

  return staged_batch_id;
end;
$$;

revoke all on function public.stage_student_import_batch(uuid, uuid, text, text, jsonb)
from public, anon, authenticated;
grant execute on function public.stage_student_import_batch(uuid, uuid, text, text, jsonb)
to service_role;

alter function public.commit_student_import_batch(uuid)
rename to commit_student_import_batch_unchecked;

revoke all on function public.commit_student_import_batch_unchecked(uuid)
from public, anon, authenticated, service_role;

create or replace function public.commit_student_import_batch(target_batch_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  batch_row public.student_import_batches%rowtype;
begin
  if actor_id is null or not public.current_profile_is_active() then
    raise exception using errcode = '42501', message = 'student_import_auth_required';
  end if;

  select * into batch_row
  from public.student_import_batches
  where id = target_batch_id
  for update;

  if not found or batch_row.created_by <> actor_id or batch_row.status <> 'staged' then
    raise exception using errcode = '42501', message = 'student_import_commit_denied';
  end if;

  -- Same-file duplicates have no existing student target yet. Re-open them before
  -- commit so the original commit function can re-evaluate rows in order. If the
  -- earlier canonical row succeeds, this row becomes a real DB duplicate; if that
  -- row became invalid meanwhile, this row may still be created safely.
  update public.student_import_rows row
  set issues = array_remove(row.issues, 'duplicate_student'),
      row_status = case
        when 'class_unassigned' = any(array_remove(row.issues, 'duplicate_student')) then 'warning'
        else 'ready'
      end
  where row.batch_id = target_batch_id
    and row.row_status = 'duplicate'
    and row.duplicate_student_id is null
    and 'duplicate_student' = any(row.issues);

  update public.student_import_rows row
  set row_status = 'error',
      issues = case
        when 'start_date_invalid' = any(row.issues) then row.issues
        else array_append(row.issues, 'start_date_invalid')
      end
  where row.batch_id = target_batch_id
    and row.row_status in ('ready', 'warning', 'error')
    and not public.student_import_optional_date_is_valid(row.payload->>'start_date');

  return public.commit_student_import_batch_unchecked(target_batch_id);
end;
$$;

revoke all on function public.commit_student_import_batch(uuid) from public, anon;
grant execute on function public.commit_student_import_batch(uuid) to authenticated;

commit;
