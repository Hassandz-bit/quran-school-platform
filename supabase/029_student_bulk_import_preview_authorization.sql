-- QuranOS V2 - fail closed before exposing the bulk-import preview surface.
-- Row-level branch checks remain in student_import_validate_one; this guard
-- prevents view-only staff from using the management-only preview RPC at all.

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

commit;
