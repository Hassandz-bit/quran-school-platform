-- QuranOS V2 - safe bulk student import foundation
-- Preview and commit are separate RPCs. Browser roles never receive direct
-- access to import audit tables, and commit revalidates every row server-side.

begin;

create table public.student_import_batches (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  source_filename text not null,
  status text not null default 'processing',
  total_rows integer not null,
  imported_rows integer not null default 0,
  warning_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  error_rows integer not null default 0,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  rolled_back_at timestamptz,
  rolled_back_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  constraint student_import_batches_filename_check
    check (char_length(btrim(source_filename)) between 1 and 255),
  constraint student_import_batches_status_check
    check (status in ('processing', 'completed', 'rollback_partial', 'rolled_back', 'failed')),
  constraint student_import_batches_count_check
    check (
      total_rows between 1 and 2000
      and imported_rows between 0 and total_rows
      and warning_rows between 0 and imported_rows
      and duplicate_rows between 0 and total_rows
      and error_rows between 0 and total_rows
      and imported_rows + duplicate_rows + error_rows <= total_rows
    ),
  constraint student_import_batches_lifecycle_check
    check (
      (status = 'processing' and completed_at is null and rolled_back_at is null and rolled_back_by is null)
      or (status = 'completed' and completed_at is not null and rolled_back_at is null and rolled_back_by is null)
      or (status = 'rollback_partial' and completed_at is not null and rolled_back_at is null and rolled_back_by is not null)
      or (status = 'rolled_back' and completed_at is not null and rolled_back_at is not null and rolled_back_by is not null)
      or (status = 'failed' and completed_at is not null and rolled_back_at is null)
    )
);

create table public.student_import_batch_students (
  batch_id uuid not null,
  school_id uuid not null,
  branch_id uuid not null,
  row_number integer not null,
  student_id uuid not null,
  had_warning boolean not null default false,
  created_at timestamptz not null default now(),
  rolled_back_at timestamptz,
  primary key (batch_id, row_number),
  constraint student_import_batch_students_batch_school_fk
    foreign key (batch_id, school_id)
    references public.student_import_batches(id, school_id)
    on delete cascade,
  constraint student_import_batch_students_branch_school_fk
    foreign key (school_id, branch_id)
    references public.branches(school_id, id),
  constraint student_import_batch_students_row_check
    check (row_number between 2 and 1000000),
  constraint student_import_batch_students_student_unique
    unique (batch_id, student_id)
);

alter table public.student_import_batches
  add constraint student_import_batches_id_school_unique unique (id, school_id);

create index student_import_batches_school_created_idx
  on public.student_import_batches (school_id, created_at desc, id);
create index student_import_batch_students_school_branch_idx
  on public.student_import_batch_students (school_id, branch_id, batch_id);
create index student_import_batch_students_student_idx
  on public.student_import_batch_students (student_id)
  where rolled_back_at is null;

create trigger student_import_batches_set_updated_at
before update on public.student_import_batches
for each row execute function public.set_updated_at();

alter table public.student_import_batches enable row level security;
alter table public.student_import_batch_students enable row level security;

revoke all on table public.student_import_batches, public.student_import_batch_students
from public, anon, authenticated;

create or replace function public.student_import_try_date(value text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  parsed date;
begin
  if value is null or btrim(value) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return null;
  end if;

  begin
    parsed := btrim(value)::date;
  exception when others then
    return null;
  end;

  if to_char(parsed, 'YYYY-MM-DD') <> btrim(value) then
    return null;
  end if;

  return parsed;
end;
$$;

revoke all on function public.student_import_try_date(text)
from public, anon, authenticated;

create or replace function public.student_import_validate_one(
  target_school_id uuid,
  target_row jsonb
)
returns table (
  validation_status text,
  error_codes text[],
  warning_codes text[],
  resolved_branch_id uuid,
  resolved_class_id uuid,
  existing_student_id uuid,
  national_id_key text,
  identity_key text,
  normalized_row jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  first_name_value text := btrim(coalesce(target_row->>'first_name', ''));
  last_name_value text := btrim(coalesce(target_row->>'last_name', ''));
  birth_date_text text := btrim(coalesce(target_row->>'birth_date', ''));
  birth_date_value date;
  gender_value text := lower(btrim(coalesce(target_row->>'gender', '')));
  national_id_value text := nullif(btrim(coalesce(target_row->>'national_id', '')), '');
  phone_value text := nullif(btrim(coalesce(target_row->>'phone', '')), '');
  email_value text := nullif(lower(btrim(coalesce(target_row->>'email', ''))), '');
  address_value text := nullif(btrim(coalesce(target_row->>'address', '')), '');
  previous_school_value text := nullif(btrim(coalesce(target_row->>'previous_school', '')), '');
  education_level_value text := nullif(lower(btrim(coalesce(target_row->>'education_level', ''))), '');
  education_year_text text := btrim(coalesce(target_row->>'education_year', ''));
  education_year_value smallint;
  guardian_name_value text := btrim(coalesce(target_row->>'guardian_name', ''));
  guardian_relation_value text := lower(btrim(coalesce(target_row->>'guardian_relation', '')));
  guardian_phone_value text := btrim(coalesce(target_row->>'guardian_phone', ''));
  guardian_phone_key text;
  guardian_email_value text := nullif(lower(btrim(coalesce(target_row->>'guardian_email', ''))), '');
  guardian_job_value text := nullif(btrim(coalesce(target_row->>'guardian_job', '')), '');
  branch_code_value text := upper(btrim(coalesce(target_row->>'branch_code', '')));
  class_code_value text := nullif(upper(btrim(coalesce(target_row->>'class_code', ''))), '');
  start_date_text text := btrim(coalesce(target_row->>'start_date', ''));
  start_date_value date;
  birth_certificate_value boolean := lower(coalesce(target_row->>'birth_certificate_provided', 'false')) in ('true', '1', 'yes');
  photos_value boolean := lower(coalesce(target_row->>'photos_provided', 'false')) in ('true', '1', 'yes');
  medical_report_value boolean := lower(coalesce(target_row->>'medical_report_provided', 'false')) in ('true', '1', 'yes');
  previous_certificate_value boolean := lower(coalesce(target_row->>'previous_certificate_provided', 'false')) in ('true', '1', 'yes');
  error_list text[] := array[]::text[];
  warning_list text[] := array[]::text[];
  branch_id_value uuid;
  class_id_value uuid;
  duplicate_id uuid;
  possible_duplicate_id uuid;
begin
  if actor_id is null
     or target_school_id is null
     or jsonb_typeof(target_row) <> 'object'
     or not public.current_profile_is_active() then
    raise exception using errcode = '42501', message = 'student_import_access_denied';
  end if;

  if not exists (
    select 1 from public.schools as school
    where school.id = target_school_id and school.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'student_import_school_unavailable';
  end if;

  if char_length(first_name_value) not between 2 and 100 then
    error_list := array_append(error_list, 'first_name_invalid');
  end if;
  if char_length(last_name_value) not between 2 and 100 then
    error_list := array_append(error_list, 'last_name_invalid');
  end if;

  birth_date_value := public.student_import_try_date(birth_date_text);
  if birth_date_value is null or birth_date_value > current_date then
    error_list := array_append(error_list, 'birth_date_invalid');
  end if;

  if gender_value not in ('male', 'female') then
    error_list := array_append(error_list, 'gender_invalid');
  end if;

  if national_id_value is not null and char_length(national_id_value) > 100 then
    error_list := array_append(error_list, 'national_id_too_long');
  end if;
  if phone_value is not null and char_length(phone_value) > 50 then
    error_list := array_append(error_list, 'phone_too_long');
  end if;
  if email_value is not null and (
    char_length(email_value) > 254
    or email_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    error_list := array_append(error_list, 'email_invalid');
  end if;
  if address_value is not null and char_length(address_value) > 500 then
    error_list := array_append(error_list, 'address_too_long');
  end if;
  if previous_school_value is not null and char_length(previous_school_value) > 200 then
    error_list := array_append(error_list, 'previous_school_too_long');
  end if;

  if education_level_value is not null
     and education_level_value not in ('primary', 'middle', 'secondary', 'university') then
    error_list := array_append(error_list, 'education_level_invalid');
  end if;

  if education_year_text <> '' then
    if education_year_text !~ '^[0-9]{1,2}$' then
      error_list := array_append(error_list, 'education_year_invalid');
    else
      education_year_value := education_year_text::smallint;
    end if;
  end if;

  if education_level_value is null and education_year_value is not null then
    error_list := array_append(error_list, 'education_year_without_level');
  elsif education_level_value = 'primary' and education_year_value is not null and education_year_value not between 1 and 5 then
    error_list := array_append(error_list, 'education_year_invalid');
  elsif education_level_value = 'middle' and education_year_value is not null and education_year_value not between 1 and 4 then
    error_list := array_append(error_list, 'education_year_invalid');
  elsif education_level_value = 'secondary' and education_year_value is not null and education_year_value not between 1 and 3 then
    error_list := array_append(error_list, 'education_year_invalid');
  elsif education_level_value = 'university' and education_year_value is not null and education_year_value not between 1 and 10 then
    error_list := array_append(error_list, 'education_year_invalid');
  end if;

  if char_length(guardian_name_value) not between 2 and 150 then
    error_list := array_append(error_list, 'guardian_name_invalid');
  end if;
  if guardian_relation_value not in (
    'father', 'mother', 'brother', 'sister', 'uncle', 'aunt',
    'grandfather', 'grandmother', 'other'
  ) then
    error_list := array_append(error_list, 'guardian_relation_invalid');
  end if;
  if char_length(guardian_phone_value) not between 3 and 50 then
    error_list := array_append(error_list, 'guardian_phone_invalid');
  end if;
  if guardian_email_value is not null and (
    char_length(guardian_email_value) > 254
    or guardian_email_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    error_list := array_append(error_list, 'guardian_email_invalid');
  end if;
  if guardian_job_value is not null and char_length(guardian_job_value) > 150 then
    error_list := array_append(error_list, 'guardian_job_too_long');
  end if;

  if branch_code_value = '' or branch_code_value !~ '^[A-Z0-9_]+$' then
    error_list := array_append(error_list, 'branch_code_invalid');
  else
    select branch.id into branch_id_value
    from public.branches as branch
    where branch.school_id = target_school_id
      and branch.code = branch_code_value
      and branch.status = 'active'
    limit 1;

    if branch_id_value is null then
      error_list := array_append(error_list, 'branch_not_found');
    elsif not public.has_branch_permission(target_school_id, branch_id_value, 'students.manage') then
      error_list := array_append(error_list, 'branch_not_allowed');
    end if;
  end if;

  if class_code_value is not null then
    if class_code_value !~ '^[A-Z0-9_]+$' then
      error_list := array_append(error_list, 'class_code_invalid');
    elsif branch_id_value is not null then
      select class.id into class_id_value
      from public.classes as class
      where class.school_id = target_school_id
        and class.branch_id = branch_id_value
        and class.code = class_code_value
        and class.status = 'active'
      limit 1;

      if class_id_value is null then
        error_list := array_append(error_list, 'class_not_found_in_branch');
      end if;
    end if;
  end if;

  start_date_value := public.student_import_try_date(start_date_text);
  if start_date_value is null then
    error_list := array_append(error_list, 'start_date_invalid');
  end if;

  guardian_phone_key := regexp_replace(guardian_phone_value, '[^0-9+]', '', 'g');
  national_id_key := national_id_value;
  identity_key := case
    when birth_date_value is null or first_name_value = '' or last_name_value = '' or guardian_phone_key = '' then null
    else lower(first_name_value) || '|' || lower(last_name_value) || '|' || birth_date_value::text || '|' || guardian_phone_key
  end;

  if cardinality(error_list) = 0 then
    if national_id_value is not null then
      select student.id into duplicate_id
      from public.students as student
      where student.school_id = target_school_id
        and btrim(student.national_id) = national_id_value
      limit 1;
    end if;

    if duplicate_id is null and identity_key is not null then
      select student.id into duplicate_id
      from public.students as student
      where student.school_id = target_school_id
        and lower(btrim(student.first_name)) = lower(first_name_value)
        and lower(btrim(student.last_name)) = lower(last_name_value)
        and student.birth_date = birth_date_value
        and regexp_replace(student.guardian_phone, '[^0-9+]', '', 'g') = guardian_phone_key
      order by student.created_at asc
      limit 1;
    end if;

    if duplicate_id is null and birth_date_value is not null then
      select student.id into possible_duplicate_id
      from public.students as student
      where student.school_id = target_school_id
        and lower(btrim(student.first_name)) = lower(first_name_value)
        and lower(btrim(student.last_name)) = lower(last_name_value)
        and student.birth_date = birth_date_value
      order by student.created_at asc
      limit 1;

      if possible_duplicate_id is not null then
        warning_list := array_append(warning_list, 'possible_duplicate_name_birthdate');
      end if;
    end if;
  end if;

  normalized_row := jsonb_build_object(
    'first_name', first_name_value,
    'last_name', last_name_value,
    'birth_date', birth_date_value,
    'gender', gender_value,
    'national_id', national_id_value,
    'phone', phone_value,
    'email', email_value,
    'address', address_value,
    'previous_school', previous_school_value,
    'education_level', education_level_value,
    'education_year', education_year_value,
    'guardian_name', guardian_name_value,
    'guardian_relation', guardian_relation_value,
    'guardian_phone', guardian_phone_value,
    'guardian_email', guardian_email_value,
    'guardian_job', guardian_job_value,
    'branch_id', branch_id_value,
    'class_id', class_id_value,
    'start_date', start_date_value,
    'birth_certificate_provided', birth_certificate_value,
    'photos_provided', photos_value,
    'medical_report_provided', medical_report_value,
    'previous_certificate_provided', previous_certificate_value
  );

  validation_status := case
    when cardinality(error_list) > 0 then 'error'
    when duplicate_id is not null then 'duplicate'
    when cardinality(warning_list) > 0 then 'warning'
    else 'ready'
  end;
  error_codes := error_list;
  warning_codes := warning_list;
  resolved_branch_id := branch_id_value;
  resolved_class_id := class_id_value;
  existing_student_id := coalesce(duplicate_id, possible_duplicate_id);
  return next;
end;
$$;

revoke all on function public.student_import_validate_one(uuid, jsonb)
from public, anon, authenticated;

create or replace function public.get_student_management_access(target_school_id uuid)
returns table (
  can_view boolean,
  can_manage boolean,
  max_import_rows integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1 from public.branches as branch
      where branch.school_id = target_school_id
        and branch.status = 'active'
        and (
          public.has_branch_permission(target_school_id, branch.id, 'students.view')
          or public.has_branch_permission(target_school_id, branch.id, 'students.manage')
        )
    ),
    exists (
      select 1 from public.branches as branch
      where branch.school_id = target_school_id
        and branch.status = 'active'
        and public.has_branch_permission(target_school_id, branch.id, 'students.manage')
    ),
    2000
  where (select auth.uid()) is not null
    and public.current_profile_is_active()
    and target_school_id is not null;
$$;

revoke all on function public.get_student_management_access(uuid)
from public, anon;
grant execute on function public.get_student_management_access(uuid)
to authenticated;

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
     or jsonb_array_length(target_rows) > 2000 then
    raise exception using errcode = '42501', message = 'student_import_preview_denied';
  end if;

  for item in
    select value as row_data, ordinality
    from jsonb_array_elements(target_rows) with ordinality
  loop
    if coalesce(item.row_data->>'row_number', '') ~ '^[0-9]{1,7}$' then
      row_number_value := (item.row_data->>'row_number')::integer;
    else
      row_number_value := item.ordinality::integer + 1;
    end if;

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

create or replace function public.commit_student_import(
  target_school_id uuid,
  target_source_filename text,
  target_rows jsonb
)
returns table (
  batch_id uuid,
  total_rows integer,
  imported_rows integer,
  warning_rows integer,
  duplicate_rows integer,
  error_rows integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  new_batch_id uuid;
  item record;
  checked record;
  row_number_value integer;
  seen_national_ids text[] := array[]::text[];
  seen_identity_keys text[] := array[]::text[];
  row_status text;
  row_errors text[];
  imported_count integer := 0;
  warning_count integer := 0;
  duplicate_count integer := 0;
  error_count integer := 0;
  inserted_student_id uuid;
  normalized jsonb;
  total_count integer;
begin
  if actor_id is null
     or target_school_id is null
     or not public.current_profile_is_active()
     or target_source_filename is null
     or char_length(btrim(target_source_filename)) not between 1 and 255
     or jsonb_typeof(target_rows) <> 'array' then
    raise exception using errcode = '42501', message = 'student_import_commit_denied';
  end if;

  total_count := jsonb_array_length(target_rows);
  if total_count < 1 or total_count > 2000 then
    raise exception using errcode = '22023', message = 'student_import_row_limit';
  end if;

  if not exists (
    select 1 from public.branches as branch
    where branch.school_id = target_school_id
      and branch.status = 'active'
      and public.has_branch_permission(target_school_id, branch.id, 'students.manage')
  ) then
    raise exception using errcode = '42501', message = 'student_import_manage_denied';
  end if;

  insert into public.student_import_batches (
    school_id, source_filename, total_rows, created_by
  ) values (
    target_school_id, btrim(target_source_filename), total_count, actor_id
  ) returning id into new_batch_id;

  for item in
    select value as row_data, ordinality
    from jsonb_array_elements(target_rows) with ordinality
  loop
    if coalesce(item.row_data->>'row_number', '') ~ '^[0-9]{1,7}$' then
      row_number_value := (item.row_data->>'row_number')::integer;
    else
      row_number_value := item.ordinality::integer + 1;
    end if;

    select * into checked
    from public.student_import_validate_one(target_school_id, item.row_data);

    row_status := checked.validation_status;
    row_errors := coalesce(checked.error_codes, array[]::text[]);

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

    if row_status = 'error' then
      error_count := error_count + 1;
      continue;
    elsif row_status = 'duplicate' then
      duplicate_count := duplicate_count + 1;
      continue;
    end if;

    normalized := checked.normalized_row;

    begin
      insert into public.students (
        school_id,
        branch_id,
        class_id,
        first_name,
        last_name,
        birth_date,
        gender,
        national_id,
        phone,
        email,
        address,
        previous_school,
        education_level,
        education_year,
        guardian_name,
        guardian_relation,
        guardian_phone,
        guardian_email,
        guardian_job,
        start_date,
        status,
        birth_certificate_provided,
        photos_provided,
        medical_report_provided,
        previous_certificate_provided,
        created_by
      ) values (
        target_school_id,
        (normalized->>'branch_id')::uuid,
        nullif(normalized->>'class_id', '')::uuid,
        normalized->>'first_name',
        normalized->>'last_name',
        (normalized->>'birth_date')::date,
        normalized->>'gender',
        nullif(normalized->>'national_id', ''),
        nullif(normalized->>'phone', ''),
        nullif(normalized->>'email', ''),
        nullif(normalized->>'address', ''),
        nullif(normalized->>'previous_school', ''),
        nullif(normalized->>'education_level', ''),
        nullif(normalized->>'education_year', '')::smallint,
        normalized->>'guardian_name',
        normalized->>'guardian_relation',
        normalized->>'guardian_phone',
        nullif(normalized->>'guardian_email', ''),
        nullif(normalized->>'guardian_job', ''),
        (normalized->>'start_date')::date,
        'active',
        coalesce((normalized->>'birth_certificate_provided')::boolean, false),
        coalesce((normalized->>'photos_provided')::boolean, false),
        coalesce((normalized->>'medical_report_provided')::boolean, false),
        coalesce((normalized->>'previous_certificate_provided')::boolean, false),
        actor_id
      ) returning id into inserted_student_id;
    exception when unique_violation then
      duplicate_count := duplicate_count + 1;
      continue;
    end;

    insert into public.student_import_batch_students (
      batch_id,
      school_id,
      branch_id,
      row_number,
      student_id,
      had_warning
    ) values (
      new_batch_id,
      target_school_id,
      (normalized->>'branch_id')::uuid,
      row_number_value,
      inserted_student_id,
      cardinality(coalesce(checked.warning_codes, array[]::text[])) > 0
    );

    imported_count := imported_count + 1;
    if cardinality(coalesce(checked.warning_codes, array[]::text[])) > 0 then
      warning_count := warning_count + 1;
    end if;
  end loop;

  update public.student_import_batches as batch
  set status = 'completed',
      imported_rows = imported_count,
      warning_rows = warning_count,
      duplicate_rows = duplicate_count,
      error_rows = error_count,
      completed_at = now()
  where batch.id = new_batch_id;

  batch_id := new_batch_id;
  total_rows := total_count;
  imported_rows := imported_count;
  warning_rows := warning_count;
  duplicate_rows := duplicate_count;
  error_rows := error_count;
  return next;
end;
$$;

revoke all on function public.commit_student_import(uuid, text, jsonb)
from public, anon;
grant execute on function public.commit_student_import(uuid, text, jsonb)
to authenticated;

create or replace function public.list_student_import_batches(
  target_school_id uuid,
  target_limit integer default 20
)
returns table (
  batch_id uuid,
  source_filename text,
  batch_status text,
  total_rows integer,
  imported_rows integer,
  warning_rows integer,
  duplicate_rows integer,
  error_rows integer,
  created_by uuid,
  created_by_name text,
  created_at timestamptz,
  completed_at timestamptz,
  rolled_back_at timestamptz,
  can_rollback boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or target_school_id is null
     or target_limit is null
     or target_limit not between 1 and 100
     or not public.current_profile_is_active()
     or not exists (
       select 1 from public.branches as branch
       where branch.school_id = target_school_id
         and public.has_branch_permission(target_school_id, branch.id, 'students.manage')
     ) then
    raise exception using errcode = '42501', message = 'student_import_history_denied';
  end if;

  return query
  select
    batch.id,
    batch.source_filename,
    batch.status,
    batch.total_rows,
    batch.imported_rows,
    batch.warning_rows,
    batch.duplicate_rows,
    batch.error_rows,
    batch.created_by,
    profile.full_name,
    batch.created_at,
    batch.completed_at,
    batch.rolled_back_at,
    (
      batch.status in ('completed', 'rollback_partial')
      and batch.completed_at is not null
      and batch.created_at >= now() - interval '24 hours'
      and exists (
        select 1
        from public.student_import_batch_students as imported
        where imported.batch_id = batch.id
          and imported.school_id = batch.school_id
          and imported.rolled_back_at is null
          and public.has_branch_permission(batch.school_id, imported.branch_id, 'students.manage')
      )
      and not exists (
        select 1
        from public.student_import_batch_students as imported
        where imported.batch_id = batch.id
          and imported.school_id = batch.school_id
          and imported.rolled_back_at is null
          and not public.has_branch_permission(batch.school_id, imported.branch_id, 'students.manage')
      )
    ) as can_rollback
  from public.student_import_batches as batch
  join public.profiles as profile on profile.id = batch.created_by
  where batch.school_id = target_school_id
    and (
      batch.created_by = (select auth.uid())
      or exists (
        select 1
        from public.student_import_batch_students as imported
        where imported.batch_id = batch.id
          and imported.school_id = batch.school_id
          and public.has_branch_permission(batch.school_id, imported.branch_id, 'students.manage')
      )
    )
  order by batch.created_at desc, batch.id desc
  limit target_limit;
end;
$$;

revoke all on function public.list_student_import_batches(uuid, integer)
from public, anon;
grant execute on function public.list_student_import_batches(uuid, integer)
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
  imported record;
  student_row public.students%rowtype;
  rolled_back_count integer := 0;
  blocked_count integer := 0;
  dependency_found boolean;
  remaining_count integer;
begin
  if actor_id is null or target_batch_id is null or not public.current_profile_is_active() then
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
    from public.student_import_batch_students as imported
    where imported.batch_id = batch_row.id
      and imported.school_id = batch_row.school_id
      and imported.rolled_back_at is null
      and not public.has_branch_permission(batch_row.school_id, imported.branch_id, 'students.manage')
  ) then
    raise exception using errcode = '42501', message = 'student_import_rollback_scope_denied';
  end if;

  for imported in
    select *
    from public.student_import_batch_students as record
    where record.batch_id = batch_row.id
      and record.school_id = batch_row.school_id
      and record.rolled_back_at is null
    order by record.row_number desc
  loop
    select * into student_row
    from public.students as student
    where student.school_id = batch_row.school_id
      and student.id = imported.student_id
    for update;

    if not found then
      update public.student_import_batch_students
      set rolled_back_at = now()
      where batch_id = batch_row.id and row_number = imported.row_number;
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

    delete from public.students
    where school_id = batch_row.school_id and id = student_row.id;

    update public.student_import_batch_students
    set rolled_back_at = now()
    where batch_id = batch_row.id and row_number = imported.row_number;

    rolled_back_count := rolled_back_count + 1;
  end loop;

  select count(*) into remaining_count
  from public.student_import_batch_students as imported
  where imported.batch_id = batch_row.id
    and imported.school_id = batch_row.school_id
    and imported.rolled_back_at is null;

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
