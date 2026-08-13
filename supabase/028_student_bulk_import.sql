-- QuranOS V2 - auditable student bulk import
-- Files are parsed by a trusted Edge Function. Browser users never access the
-- staging tables directly; commit/rollback are narrow authenticated RPCs.

begin;

create table public.student_import_batches (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  file_name text not null,
  file_sha256 text not null,
  status text not null default 'staged',
  total_count integer not null default 0,
  ready_count integer not null default 0,
  warning_count integer not null default 0,
  duplicate_count integer not null default 0,
  error_count integer not null default 0,
  created_count integer not null default 0,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  committed_at timestamptz,
  rolled_back_at timestamptz,
  constraint student_import_batches_file_name_check
    check (char_length(btrim(file_name)) between 1 and 180),
  constraint student_import_batches_sha_check
    check (file_sha256 ~ '^[a-f0-9]{64}$'),
  constraint student_import_batches_status_check
    check (status in ('staged','committed','rolled_back','failed')),
  constraint student_import_batches_counts_check
    check (
      total_count >= 0 and ready_count >= 0 and warning_count >= 0
      and duplicate_count >= 0 and error_count >= 0 and created_count >= 0
      and ready_count + warning_count + duplicate_count + error_count = total_count
    ),
  constraint student_import_batches_state_dates_check
    check (
      (status = 'staged' and committed_at is null and rolled_back_at is null)
      or (status = 'committed' and committed_at is not null and rolled_back_at is null)
      or (status = 'rolled_back' and committed_at is not null and rolled_back_at is not null)
      or status = 'failed'
    )
);

create table public.student_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.student_import_batches(id) on delete cascade,
  row_number integer not null,
  payload jsonb not null,
  row_status text not null,
  issues text[] not null default '{}',
  duplicate_student_id uuid references public.students(id),
  created_student_id uuid references public.students(id),
  created_at timestamptz not null default now(),
  constraint student_import_rows_number_check check (row_number >= 2),
  constraint student_import_rows_status_check
    check (row_status in ('ready','warning','duplicate','error','created')),
  constraint student_import_rows_payload_object_check
    check (jsonb_typeof(payload) = 'object'),
  constraint student_import_rows_unique unique (batch_id, row_number),
  constraint student_import_rows_created_shape_check
    check (
      (row_status = 'created' and created_student_id is not null)
      or (row_status <> 'created' and created_student_id is null)
    )
);

create index student_import_batches_school_created_idx
  on public.student_import_batches (school_id, created_at desc);
create index student_import_rows_batch_status_idx
  on public.student_import_rows (batch_id, row_status, row_number);

alter table public.student_import_batches enable row level security;
alter table public.student_import_rows enable row level security;
revoke all on public.student_import_batches, public.student_import_rows
from public, anon, authenticated;

-- Service-side permission helper used only while staging parsed rows.
create or replace function public.profile_has_branch_permission(
  target_profile_id uuid,
  target_school_id uuid,
  target_branch_id uuid,
  target_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    join public.school_memberships membership
      on membership.profile_id = profile.id
     and membership.school_id = target_school_id
     and membership.status = 'active'
    join public.membership_roles membership_role
      on membership_role.school_id = membership.school_id
     and membership_role.membership_id = membership.id
    join public.roles role
      on role.school_id = membership_role.school_id
     and role.id = membership_role.role_id
     and role.status = 'active'
    join public.role_permissions role_permission
      on role_permission.school_id = role.school_id
     and role_permission.role_id = role.id
    join public.permissions permission
      on permission.id = role_permission.permission_id
    join public.branches branch
      on branch.school_id = target_school_id
     and branch.id = target_branch_id
     and branch.status = 'active'
    join public.schools school
      on school.id = target_school_id
     and school.status = 'active'
    where profile.id = target_profile_id
      and profile.status = 'active'
      and (membership_role.branch_id is null or membership_role.branch_id = target_branch_id)
      and permission.code = target_permission_code
  );
$$;

revoke all on function public.profile_has_branch_permission(uuid, uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.profile_has_branch_permission(uuid, uuid, uuid, text)
to service_role;

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
  batch_id uuid;
  item jsonb;
  source_row integer;
  branch_code text;
  class_code text;
  branch_id uuid;
  class_id uuid;
  first_name text;
  last_name text;
  birth_text text;
  birth_value date;
  gender_value text;
  national_id_value text;
  guardian_name_value text;
  guardian_relation_value text;
  guardian_phone_value text;
  issue_list text[];
  resolved_status text;
  duplicate_id uuid;
  total_rows integer := 0;
  ready_rows integer := 0;
  warning_rows integer := 0;
  duplicate_rows integer := 0;
  error_rows integer := 0;
begin
  if target_school_id is null or target_actor_id is null
     or target_file_name is null or target_file_sha256 is null
     or target_rows is null or jsonb_typeof(target_rows) <> 'array'
     or jsonb_array_length(target_rows) < 1
     or jsonb_array_length(target_rows) > 5000 then
    raise exception using errcode = '22023', message = 'student_import_invalid_input';
  end if;

  if not exists (
    select 1 from public.profiles p where p.id = target_actor_id and p.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'student_import_actor_unavailable';
  end if;

  insert into public.student_import_batches (
    school_id, file_name, file_sha256, created_by
  ) values (
    target_school_id, left(btrim(target_file_name), 180), lower(target_file_sha256), target_actor_id
  ) returning id into batch_id;

  for item in select value from jsonb_array_elements(target_rows)
  loop
    total_rows := total_rows + 1;
    source_row := coalesce(nullif(item->>'row_number','')::integer, total_rows + 1);
    issue_list := '{}';
    duplicate_id := null;
    branch_id := null;
    class_id := null;
    birth_value := null;

    branch_code := upper(btrim(coalesce(item->>'branch_code','')));
    class_code := upper(btrim(coalesce(item->>'class_code','')));
    first_name := btrim(coalesce(item->>'first_name',''));
    last_name := btrim(coalesce(item->>'last_name',''));
    birth_text := btrim(coalesce(item->>'birth_date',''));
    gender_value := lower(btrim(coalesce(item->>'gender','')));
    national_id_value := nullif(btrim(coalesce(item->>'national_id','')), '');
    guardian_name_value := btrim(coalesce(item->>'guardian_name',''));
    guardian_relation_value := lower(btrim(coalesce(item->>'guardian_relation','')));
    guardian_phone_value := btrim(coalesce(item->>'guardian_phone',''));

    select branch.id into branch_id
    from public.branches branch
    where branch.school_id = target_school_id
      and branch.status = 'active'
      and upper(branch.code) = branch_code
    limit 1;

    if branch_id is null then
      issue_list := array_append(issue_list, 'branch_not_found');
    elsif not public.profile_has_branch_permission(
      target_actor_id, target_school_id, branch_id, 'students.manage'
    ) then
      issue_list := array_append(issue_list, 'branch_permission_denied');
    end if;

    if class_code <> '' and branch_id is not null then
      select class.id into class_id
      from public.classes class
      where class.school_id = target_school_id
        and class.branch_id = branch_id
        and class.status = 'active'
        and upper(class.code) = class_code
      limit 1;
      if class_id is null then
        issue_list := array_append(issue_list, 'class_not_found');
      end if;
    elsif class_code = '' then
      issue_list := array_append(issue_list, 'class_unassigned');
    end if;

    if char_length(first_name) not between 2 and 100 then
      issue_list := array_append(issue_list, 'first_name_invalid');
    end if;
    if char_length(last_name) not between 2 and 100 then
      issue_list := array_append(issue_list, 'last_name_invalid');
    end if;
    if birth_text ~ '^\d{4}-\d{2}-\d{2}$' then
      begin
        birth_value := birth_text::date;
      exception when others then
        birth_value := null;
      end;
    end if;
    if birth_value is null or birth_value > current_date then
      issue_list := array_append(issue_list, 'birth_date_invalid');
    end if;
    if gender_value not in ('male','female') then
      issue_list := array_append(issue_list, 'gender_invalid');
    end if;
    if char_length(guardian_name_value) < 2 then
      issue_list := array_append(issue_list, 'guardian_name_invalid');
    end if;
    if guardian_relation_value not in (
      'father','mother','brother','sister','uncle','aunt','grandfather','grandmother','other'
    ) then
      issue_list := array_append(issue_list, 'guardian_relation_invalid');
    end if;
    if char_length(guardian_phone_value) < 6 then
      issue_list := array_append(issue_list, 'guardian_phone_invalid');
    end if;

    if national_id_value is not null then
      select student.id into duplicate_id
      from public.students student
      where student.school_id = target_school_id
        and btrim(student.national_id) = national_id_value
      limit 1;

      if duplicate_id is null then
        select row.created_student_id into duplicate_id
        from public.student_import_rows row
        where row.batch_id = batch_id
          and nullif(btrim(row.payload->>'national_id'),'') = national_id_value
        limit 1;
        if found then
          duplicate_id := coalesce(duplicate_id, '00000000-0000-0000-0000-000000000000'::uuid);
        end if;
      end if;
    end if;

    if duplicate_id is null and birth_value is not null then
      select student.id into duplicate_id
      from public.students student
      where student.school_id = target_school_id
        and lower(btrim(student.first_name)) = lower(first_name)
        and lower(btrim(student.last_name)) = lower(last_name)
        and student.birth_date = birth_value
        and regexp_replace(student.guardian_phone, '\s+', '', 'g') = regexp_replace(guardian_phone_value, '\s+', '', 'g')
      limit 1;
    end if;

    if duplicate_id is not null then
      resolved_status := 'duplicate';
      issue_list := array_append(issue_list, 'duplicate_student');
      duplicate_rows := duplicate_rows + 1;
    elsif issue_list && array[
      'branch_not_found','branch_permission_denied','class_not_found','first_name_invalid',
      'last_name_invalid','birth_date_invalid','gender_invalid','guardian_name_invalid',
      'guardian_relation_invalid','guardian_phone_invalid'
    ] then
      resolved_status := 'error';
      error_rows := error_rows + 1;
    elsif 'class_unassigned' = any(issue_list) then
      resolved_status := 'warning';
      warning_rows := warning_rows + 1;
    else
      resolved_status := 'ready';
      ready_rows := ready_rows + 1;
    end if;

    insert into public.student_import_rows (
      batch_id, row_number, payload, row_status, issues, duplicate_student_id
    ) values (
      batch_id,
      source_row,
      item,
      resolved_status,
      issue_list,
      case when duplicate_id = '00000000-0000-0000-0000-000000000000'::uuid then null else duplicate_id end
    );
  end loop;

  update public.student_import_batches
  set total_count = total_rows,
      ready_count = ready_rows,
      warning_count = warning_rows,
      duplicate_count = duplicate_rows,
      error_count = error_rows
  where id = batch_id;

  return batch_id;
end;
$$;

revoke all on function public.stage_student_import_batch(uuid, uuid, text, text, jsonb)
from public, anon, authenticated;
grant execute on function public.stage_student_import_batch(uuid, uuid, text, text, jsonb)
to service_role;

create or replace function public.get_student_import_batch(target_batch_id uuid)
returns table (
  batch_id uuid,
  school_id uuid,
  file_name text,
  status text,
  total_count integer,
  ready_count integer,
  warning_count integer,
  duplicate_count integer,
  error_count integer,
  created_count integer,
  created_at timestamptz,
  committed_at timestamptz,
  rolled_back_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select batch.id, batch.school_id, batch.file_name, batch.status,
    batch.total_count, batch.ready_count, batch.warning_count,
    batch.duplicate_count, batch.error_count, batch.created_count,
    batch.created_at, batch.committed_at, batch.rolled_back_at
  from public.student_import_batches batch
  where batch.id = target_batch_id
    and batch.created_by = (select auth.uid())
    and public.current_profile_is_active();
$$;

create or replace function public.list_student_import_rows(target_batch_id uuid)
returns table (
  row_number integer,
  payload jsonb,
  row_status text,
  issues text[],
  duplicate_student_id uuid,
  created_student_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select row.row_number, row.payload, row.row_status, row.issues,
    row.duplicate_student_id, row.created_student_id
  from public.student_import_rows row
  join public.student_import_batches batch on batch.id = row.batch_id
  where row.batch_id = target_batch_id
    and batch.created_by = (select auth.uid())
    and public.current_profile_is_active()
  order by row.row_number;
$$;

revoke all on function public.get_student_import_batch(uuid) from public, anon;
revoke all on function public.list_student_import_rows(uuid) from public, anon;
grant execute on function public.get_student_import_batch(uuid) to authenticated;
grant execute on function public.list_student_import_rows(uuid) to authenticated;

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
  row_record record;
  branch_id uuid;
  class_id uuid;
  duplicate_id uuid;
  new_student_id uuid;
  created_total integer := 0;
  birth_value date;
  national_id_value text;
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

  for row_record in
    select * from public.student_import_rows
    where batch_id = target_batch_id and row_status in ('ready','warning')
    order by row_number
    for update
  loop
    select branch.id into branch_id
    from public.branches branch
    where branch.school_id = batch_row.school_id
      and branch.status = 'active'
      and upper(branch.code) = upper(btrim(row_record.payload->>'branch_code'))
    limit 1;

    if branch_id is null or not public.has_branch_permission(
      batch_row.school_id, branch_id, 'students.manage'
    ) then
      update public.student_import_rows
      set row_status = 'error', issues = array_append(issues, 'branch_permission_changed')
      where id = row_record.id;
      continue;
    end if;

    class_id := null;
    if btrim(coalesce(row_record.payload->>'class_code','')) <> '' then
      select class.id into class_id
      from public.classes class
      where class.school_id = batch_row.school_id
        and class.branch_id = branch_id
        and class.status = 'active'
        and upper(class.code) = upper(btrim(row_record.payload->>'class_code'))
      limit 1;
      if class_id is null then
        update public.student_import_rows
        set row_status = 'error', issues = array_append(issues, 'class_changed')
        where id = row_record.id;
        continue;
      end if;
    end if;

    birth_value := (row_record.payload->>'birth_date')::date;
    national_id_value := nullif(btrim(coalesce(row_record.payload->>'national_id','')), '');
    duplicate_id := null;

    if national_id_value is not null then
      select student.id into duplicate_id
      from public.students student
      where student.school_id = batch_row.school_id
        and btrim(student.national_id) = national_id_value
      limit 1;
    end if;

    if duplicate_id is null then
      select student.id into duplicate_id
      from public.students student
      where student.school_id = batch_row.school_id
        and lower(btrim(student.first_name)) = lower(btrim(row_record.payload->>'first_name'))
        and lower(btrim(student.last_name)) = lower(btrim(row_record.payload->>'last_name'))
        and student.birth_date = birth_value
        and regexp_replace(student.guardian_phone, '\s+', '', 'g') =
            regexp_replace(btrim(row_record.payload->>'guardian_phone'), '\s+', '', 'g')
      limit 1;
    end if;

    if duplicate_id is not null then
      update public.student_import_rows
      set row_status = 'duplicate',
          issues = array_append(issues, 'duplicate_detected_at_commit'),
          duplicate_student_id = duplicate_id
      where id = row_record.id;
      continue;
    end if;

    insert into public.students (
      school_id, branch_id, class_id, first_name, last_name, birth_date, gender,
      national_id, phone, email, address, previous_school, education_level,
      guardian_name, guardian_relation, guardian_phone, guardian_email, guardian_job,
      start_date, status, created_by
    ) values (
      batch_row.school_id,
      branch_id,
      class_id,
      btrim(row_record.payload->>'first_name'),
      btrim(row_record.payload->>'last_name'),
      birth_value,
      lower(btrim(row_record.payload->>'gender')),
      national_id_value,
      nullif(btrim(coalesce(row_record.payload->>'phone','')), ''),
      nullif(lower(btrim(coalesce(row_record.payload->>'email',''))), ''),
      nullif(btrim(coalesce(row_record.payload->>'address','')), ''),
      nullif(btrim(coalesce(row_record.payload->>'previous_school','')), ''),
      nullif(btrim(coalesce(row_record.payload->>'education_level','')), ''),
      btrim(row_record.payload->>'guardian_name'),
      lower(btrim(row_record.payload->>'guardian_relation')),
      btrim(row_record.payload->>'guardian_phone'),
      nullif(lower(btrim(coalesce(row_record.payload->>'guardian_email',''))), ''),
      nullif(btrim(coalesce(row_record.payload->>'guardian_job','')), ''),
      coalesce(nullif(row_record.payload->>'start_date','')::date, current_date),
      'active',
      actor_id
    ) returning id into new_student_id;

    update public.student_import_rows
    set row_status = 'created', created_student_id = new_student_id
    where id = row_record.id;
    created_total := created_total + 1;
  end loop;

  update public.student_import_batches batch
  set status = 'committed',
      created_count = created_total,
      committed_at = now(),
      ready_count = (select count(*) from public.student_import_rows r where r.batch_id = batch.id and r.row_status = 'ready'),
      warning_count = (select count(*) from public.student_import_rows r where r.batch_id = batch.id and r.row_status = 'warning'),
      duplicate_count = (select count(*) from public.student_import_rows r where r.batch_id = batch.id and r.row_status = 'duplicate'),
      error_count = (select count(*) from public.student_import_rows r where r.batch_id = batch.id and r.row_status = 'error')
  where batch.id = target_batch_id;

  return created_total;
end;
$$;

revoke all on function public.commit_student_import_batch(uuid) from public, anon;
grant execute on function public.commit_student_import_batch(uuid) to authenticated;

create or replace function public.rollback_student_import_batch(target_batch_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  batch_row public.student_import_batches%rowtype;
  student_record record;
  removed_total integer := 0;
begin
  if actor_id is null or not public.current_profile_is_active() then
    raise exception using errcode = '42501', message = 'student_import_auth_required';
  end if;

  select * into batch_row
  from public.student_import_batches
  where id = target_batch_id
  for update;

  if not found or batch_row.created_by <> actor_id or batch_row.status <> 'committed' then
    raise exception using errcode = '42501', message = 'student_import_rollback_denied';
  end if;

  for student_record in
    select row.id as row_id, row.created_student_id as student_id,
           student.school_id, student.branch_id
    from public.student_import_rows row
    join public.students student on student.id = row.created_student_id
    where row.batch_id = target_batch_id and row.row_status = 'created'
    order by row.row_number
    for update of student
  loop
    if not public.has_branch_permission(
      student_record.school_id, student_record.branch_id, 'students.manage'
    ) then
      raise exception using errcode = '42501', message = 'student_import_rollback_permission_changed';
    end if;

    if exists (select 1 from public.student_guardians sg where sg.student_id = student_record.student_id)
       or exists (select 1 from public.attendance_records ar where ar.student_id = student_record.student_id)
       or exists (select 1 from public.memorization_records mr where mr.student_id = student_record.student_id)
       or exists (select 1 from public.student_charges sc where sc.student_id = student_record.student_id)
       or exists (select 1 from public.payments p where p.student_id = student_record.student_id)
       or exists (select 1 from public.official_receipts receipt where receipt.student_id = student_record.student_id) then
      raise exception using errcode = '23503', message = 'student_import_rollback_blocked_by_activity';
    end if;

    delete from public.students where id = student_record.student_id;
    update public.student_import_rows
    set row_status = 'ready', created_student_id = null
    where id = student_record.row_id;
    removed_total := removed_total + 1;
  end loop;

  update public.student_import_batches
  set status = 'rolled_back', rolled_back_at = now(), created_count = 0
  where id = target_batch_id;

  return removed_total;
end;
$$;

revoke all on function public.rollback_student_import_batch(uuid) from public, anon;
grant execute on function public.rollback_student_import_batch(uuid) to authenticated;

commit;
