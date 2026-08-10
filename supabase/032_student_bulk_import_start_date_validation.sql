-- QuranOS V2 - validate optional student import start dates before preview/commit.
-- Keeps malformed registration dates row-scoped instead of allowing one value to abort a batch.
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

  update public.student_import_rows row
  set row_status = 'error',
      issues = case
        when 'start_date_invalid' = any(row.issues) then row.issues
        else array_append(row.issues, 'start_date_invalid')
      end
  where row.batch_id = staged_batch_id
    and row.row_status in ('ready', 'warning', 'error')
    and not public.student_import_optional_date_is_valid(row.payload->>'start_date');

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
