-- QuranOS V2 - harden the bulk-import management surface.
-- 1) Preview is management-only before any row-level details are returned.
-- 2) Rollback avoids PL/pgSQL record/alias shadowing and keeps exact scope checks.

begin;

create or replace function public.preview_student_import(
  target_school_id uuid,
  target_rows jsonb
)
returns table (
  row_number integer,
  validation_status text,
  error_codes text[],
  warning_codes text[],
  existing_student_id uuid,
  resolved_branch_id uuid,
  resolved_class_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  item record;
  checked record;
  row_number_value integer;
  seen_national_ids text[] := array[]::text[];
  seen_identity_keys text[] := array[]::text[];
  row_status text;
  row_errors text[];
  row_warnings text[];
begin
  if (select auth.uid()) is null
     or target_school_id is null
     or not public.current_profile_is_active()
     or jsonb_typeof(target_rows) <> 'array'
     or jsonb_array_length(target_rows) < 1
     or jsonb_array_length(target_rows) > 2000
     or not exists (
       select 1
       from public.branches as branch
       where branch.school_id = target_school_id
         and branch.status = 'active'
         and public.has_branch_permission(
           target_school_id,
           branch.id,
           'students.manage'
         )
     ) then
    raise exception using errcode = '42501', message = 'student_import_preview_denied';
  end if;

  for item in
    select value as row_data, ordinality
    from jsonb_array_elements(target_rows) with ordinality
  loop
    row_number_value := item.ordinality::integer + 1;

    select * into checked
    from public.student_import_validate_one(target_school_id, item.row_data);

    row_status := checked.validation_status;
    row_errors := coalesce(checked.error_codes, array[]::text[]);
    row_warnings := coalesce(checked.warning_codes, array[]::text[]);

    if row_status <> 'error' then
      if checked.national_id_key is not null
         and checked.national_id_key = any(seen_national_ids) then
        row_status := 'duplicate';
        row_errors := array_append(row_errors, 'duplicate_in_file');
      elsif checked.identity_key is not null
         and checked.identity_key = any(seen_identity_keys) then
        row_status := 'duplicate';
        row_errors := array_append(row_errors, 'duplicate_in_file');
      end if;

      if checked.national_id_key is not null
         and not checked.national_id_key = any(seen_national_ids) then
        seen_national_ids := array_append(seen_national_ids, checked.national_id_key);
      end if;
      if checked.identity_key is not null
         and not checked.identity_key = any(seen_identity_keys) then
        seen_identity_keys := array_append(seen_identity_keys, checked.identity_key);
      end if;
    end if;

    row_number := row_number_value;
    validation_status := row_status;
    error_codes := row_errors;
    warning_codes := row_warnings;
    existing_student_id := checked.existing_student_id;
    resolved_branch_id := checked.resolved_branch_id;
    resolved_class_id := checked.resolved_class_id;
    return next;
  end loop;
end;
$$;

revoke all on function public.preview_student_import(uuid, jsonb)
from public, anon;
grant execute on function public.preview_student_import(uuid, jsonb)
to authenticated;

create or replace function public.rollback_student_import(target_batch_id uuid)
returns table (
  batch_id uuid,
  rolled_back_students integer,
  blocked_students integer,
  batch_status text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  batch_row public.student_import_batches%rowtype;
  imported_row record;
  student_row public.students%rowtype;
  rolled_back_count integer := 0;
  blocked_count integer := 0;
  dependency_found boolean;
  remaining_count integer;
begin
  if actor_id is null
     or target_batch_id is null
     or not public.current_profile_is_active() then
    raise exception using errcode = '42501', message = 'student_import_rollback_denied';
  end if;

  select * into batch_row
  from public.student_import_batches as batch
  where batch.id = target_batch_id
  for update;

  if not found
     or batch_row.status not in ('completed', 'rollback_partial')
     or batch_row.completed_at is null
     or batch_row.created_at < now() - interval '24 hours' then
    raise exception using errcode = '42501', message = 'student_import_rollback_unavailable';
  end if;

  if exists (
    select 1
    from public.student_import_batch_students as mapping
    where mapping.batch_id = batch_row.id
      and mapping.school_id = batch_row.school_id
      and mapping.rolled_back_at is null
      and not public.has_branch_permission(
        batch_row.school_id,
        mapping.branch_id,
        'students.manage'
      )
  ) then
    raise exception using errcode = '42501', message = 'student_import_rollback_scope_denied';
  end if;

  for imported_row in
    select mapping.*
    from public.student_import_batch_students as mapping
    where mapping.batch_id = batch_row.id
      and mapping.school_id = batch_row.school_id
      and mapping.rolled_back_at is null
    order by mapping.row_number desc
  loop
    select * into student_row
    from public.students as student
    where student.school_id = batch_row.school_id
      and student.id = imported_row.student_id
    for update;

    if not found then
      update public.student_import_batch_students as mapping
      set rolled_back_at = now()
      where mapping.batch_id = batch_row.id
        and mapping.row_number = imported_row.row_number;
      rolled_back_count := rolled_back_count + 1;
      continue;
    end if;

    dependency_found := false;

    if student_row.created_by <> batch_row.created_by
       or student_row.created_at < batch_row.created_at - interval '1 minute'
       or student_row.updated_at > batch_row.completed_at + interval '2 minutes' then
      dependency_found := true;
    end if;

    if not dependency_found and exists (
      select 1 from public.student_guardians as relationship
      where relationship.school_id = batch_row.school_id
        and relationship.student_id = student_row.id
    ) then dependency_found := true; end if;

    if not dependency_found and exists (
      select 1 from public.attendance_records as attendance
      where attendance.school_id = batch_row.school_id
        and attendance.student_id = student_row.id
    ) then dependency_found := true; end if;

    if not dependency_found and exists (
      select 1 from public.memorization_records as memorization
      where memorization.school_id = batch_row.school_id
        and memorization.student_id = student_row.id
    ) then dependency_found := true; end if;

    if not dependency_found and exists (
      select 1 from public.student_charges as charge
      where charge.school_id = batch_row.school_id
        and charge.student_id = student_row.id
    ) then dependency_found := true; end if;

    if not dependency_found and exists (
      select 1 from public.student_discounts as discount
      where discount.school_id = batch_row.school_id
        and discount.student_id = student_row.id
    ) then dependency_found := true; end if;

    if not dependency_found and exists (
      select 1 from public.official_receipts as receipt
      where receipt.school_id = batch_row.school_id
        and receipt.student_id = student_row.id
    ) then dependency_found := true; end if;

    if dependency_found then
      blocked_count := blocked_count + 1;
      continue;
    end if;

    delete from public.students as student
    where student.school_id = batch_row.school_id
      and student.id = student_row.id;

    update public.student_import_batch_students as mapping
    set rolled_back_at = now()
    where mapping.batch_id = batch_row.id
      and mapping.row_number = imported_row.row_number;

    rolled_back_count := rolled_back_count + 1;
  end loop;

  select count(*) into remaining_count
  from public.student_import_batch_students as mapping
  where mapping.batch_id = batch_row.id
    and mapping.school_id = batch_row.school_id
    and mapping.rolled_back_at is null;

  update public.student_import_batches as batch
  set status = case when remaining_count = 0 then 'rolled_back' else 'rollback_partial' end,
      rolled_back_by = actor_id,
      rolled_back_at = case when remaining_count = 0 then now() else null end
  where batch.id = batch_row.id;

  batch_id := batch_row.id;
  rolled_back_students := rolled_back_count;
  blocked_students := blocked_count;
  batch_status := case when remaining_count = 0 then 'rolled_back' else 'rollback_partial' end;
  return next;
end;
$$;

revoke all on function public.rollback_student_import(uuid)
from public, anon;
grant execute on function public.rollback_student_import(uuid)
to authenticated;

commit;
