-- QuranOS V2 - private documents management foundation
-- Documents can belong to an enrolled student or a pre-enrollment registration lead.
-- Metadata is RPC-only; file bytes live in a private Storage bucket protected by RLS.

begin;

insert into public.permissions (code, module, name_ar, description)
values
  ('documents.view', 'documents', 'عرض الوثائق', 'عرض وثائق الطلاب وطلبات التسجيل ضمن الفروع المصرح بها'),
  ('documents.manage', 'documents', 'إدارة الوثائق', 'إنشاء ملفات الوثائق ورفعها والتحقق من حالتها ضمن الفروع المصرح بها')
on conflict (code) do update
set module = excluded.module,
    name_ar = excluded.name_ar,
    description = excluded.description;

with grants (role_code, permission_code) as (
  values
    ('school_admin', 'documents.view'),
    ('school_admin', 'documents.manage'),
    ('branch_manager', 'documents.view'),
    ('branch_manager', 'documents.manage'),
    ('registrar', 'documents.view'),
    ('registrar', 'documents.manage')
)
insert into public.role_permissions (school_id, role_id, permission_id)
select role.school_id, role.id, permission.id
from grants as role_grant
join public.roles as role
  on role.code = role_grant.role_code
 and role.status = 'active'
join public.permissions as permission
  on permission.code = role_grant.permission_code
on conflict (role_id, permission_id) do nothing;

create table public.document_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  branch_id uuid not null,
  subject_type text not null,
  student_id uuid references public.students(id),
  registration_lead_id uuid references public.registration_leads(id),
  category text not null,
  custom_label text,
  status text not null default 'missing',
  object_path text,
  original_file_name text,
  mime_type text,
  size_bytes bigint,
  issued_on date,
  expires_on date,
  notes text,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_records_branch_school_fk
    foreign key (school_id, branch_id) references public.branches(school_id, id),
  constraint document_records_subject_shape_check check (
    (subject_type = 'student' and student_id is not null and registration_lead_id is null)
    or
    (subject_type = 'registration_lead' and student_id is null and registration_lead_id is not null)
  ),
  constraint document_records_category_check check (
    category in (
      'birth_certificate',
      'personal_photos',
      'medical_report',
      'previous_certificate',
      'guardian_identity',
      'registration_form',
      'other'
    )
  ),
  constraint document_records_custom_label_check check (
    (category <> 'other' and custom_label is null)
    or
    (category = 'other' and char_length(btrim(custom_label)) between 2 and 120)
  ),
  constraint document_records_status_check check (
    status in ('missing', 'uploaded', 'verified', 'rejected', 'expired')
  ),
  constraint document_records_file_shape_check check (
    (
      status = 'missing'
      and object_path is null
      and original_file_name is null
      and mime_type is null
      and size_bytes is null
    )
    or
    (
      status in ('uploaded', 'verified', 'rejected', 'expired')
      and object_path is not null
      and original_file_name is not null
      and mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
      and size_bytes between 1 and 10485760
    )
  ),
  constraint document_records_dates_check check (
    issued_on is null or expires_on is null or expires_on >= issued_on
  ),
  constraint document_records_notes_check check (
    notes is null or char_length(notes) <= 2000
  ),
  constraint document_records_verify_shape_check check (
    (status = 'verified' and verified_by is not null and verified_at is not null)
    or
    (status <> 'verified')
  )
);

create unique index document_records_current_student_category_idx
  on public.document_records (school_id, student_id, category)
  where subject_type = 'student';

create unique index document_records_current_lead_category_idx
  on public.document_records (school_id, registration_lead_id, category)
  where subject_type = 'registration_lead';

create index document_records_school_branch_status_idx
  on public.document_records (school_id, branch_id, status, updated_at desc);
create index document_records_student_idx
  on public.document_records (student_id, updated_at desc)
  where student_id is not null;
create index document_records_registration_lead_idx
  on public.document_records (registration_lead_id, updated_at desc)
  where registration_lead_id is not null;

create table public.document_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.document_records(id),
  school_id uuid not null references public.schools(id),
  branch_id uuid not null,
  event_type text not null,
  previous_status text,
  new_status text,
  actor_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint document_events_branch_school_fk
    foreign key (school_id, branch_id) references public.branches(school_id, id),
  constraint document_events_type_check check (
    event_type in ('slot_created', 'file_uploaded', 'status_updated', 'file_replaced')
  ),
  constraint document_events_status_check check (
    previous_status is null or previous_status in ('missing', 'uploaded', 'verified', 'rejected', 'expired')
  ),
  constraint document_events_new_status_check check (
    new_status is null or new_status in ('missing', 'uploaded', 'verified', 'rejected', 'expired')
  )
);

create index document_events_document_created_idx
  on public.document_events (document_id, created_at desc, id desc);

create or replace function public.validate_document_subject_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.subject_type = 'student' then
    if not exists (
      select 1
      from public.students as student
      where student.id = new.student_id
        and student.school_id = new.school_id
        and student.branch_id = new.branch_id
    ) then
      raise exception using errcode = '23503', message = 'document_subject_scope_invalid';
    end if;
  elsif new.subject_type = 'registration_lead' then
    if not exists (
      select 1
      from public.registration_leads as lead
      where lead.id = new.registration_lead_id
        and lead.school_id = new.school_id
        and lead.branch_id = new.branch_id
    ) then
      raise exception using errcode = '23503', message = 'document_subject_scope_invalid';
    end if;
  else
    raise exception using errcode = '22023', message = 'document_subject_type_invalid';
  end if;

  return new;
end;
$$;

create trigger document_records_validate_subject_scope
before insert or update of school_id, branch_id, subject_type, student_id, registration_lead_id
on public.document_records
for each row execute function public.validate_document_subject_scope();

create trigger document_records_set_updated_at
before update on public.document_records
for each row execute function public.set_updated_at();

alter table public.document_records enable row level security;
alter table public.document_events enable row level security;
revoke all on table public.document_records, public.document_events
from public, anon, authenticated;

create or replace function public.get_documents_access(target_school_id uuid)
returns table (can_view boolean, can_manage boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.branches as branch
      where branch.school_id = target_school_id
        and (
          public.has_branch_permission(target_school_id, branch.id, 'documents.view')
          or public.has_branch_permission(target_school_id, branch.id, 'documents.manage')
        )
    ),
    exists (
      select 1
      from public.branches as branch
      where branch.school_id = target_school_id
        and branch.status = 'active'
        and public.has_branch_permission(target_school_id, branch.id, 'documents.manage')
    );
$$;

revoke all on function public.get_documents_access(uuid) from public, anon;
grant execute on function public.get_documents_access(uuid) to authenticated;

create or replace function public.list_document_subjects(
  target_school_id uuid,
  target_subject_type text default null,
  target_limit integer default 500
)
returns table (
  subject_type text,
  subject_id uuid,
  branch_id uuid,
  branch_name text,
  subject_name text,
  secondary_name text,
  can_manage boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if target_school_id is null
     or (target_subject_type is not null and target_subject_type not in ('student', 'registration_lead'))
     or target_limit is null or target_limit < 1 or target_limit > 1000 then
    raise exception using errcode = '22023', message = 'documents_invalid_input';
  end if;

  return query
  select * from (
    select
      'student'::text as subject_type,
      student.id as subject_id,
      student.branch_id,
      branch.name as branch_name,
      btrim(student.first_name || ' ' || student.last_name) as subject_name,
      student.guardian_name as secondary_name,
      (branch.status = 'active' and public.has_branch_permission(student.school_id, student.branch_id, 'documents.manage')) as can_manage
    from public.students as student
    join public.branches as branch
      on branch.school_id = student.school_id and branch.id = student.branch_id
    where student.school_id = target_school_id
      and (target_subject_type is null or target_subject_type = 'student')
      and (
        public.has_branch_permission(student.school_id, student.branch_id, 'documents.view')
        or public.has_branch_permission(student.school_id, student.branch_id, 'documents.manage')
      )

    union all

    select
      'registration_lead'::text,
      lead.id,
      lead.branch_id,
      branch.name,
      btrim(lead.prospect_first_name || ' ' || lead.prospect_last_name),
      lead.guardian_name,
      (branch.status = 'active' and public.has_branch_permission(lead.school_id, lead.branch_id, 'documents.manage'))
    from public.registration_leads as lead
    join public.branches as branch
      on branch.school_id = lead.school_id and branch.id = lead.branch_id
    where lead.school_id = target_school_id
      and (target_subject_type is null or target_subject_type = 'registration_lead')
      and (
        public.has_branch_permission(lead.school_id, lead.branch_id, 'documents.view')
        or public.has_branch_permission(lead.school_id, lead.branch_id, 'documents.manage')
      )
  ) as subjects
  order by subjects.branch_name, subjects.subject_name, subjects.subject_id
  limit target_limit;
end;
$$;

revoke all on function public.list_document_subjects(uuid, text, integer) from public, anon;
grant execute on function public.list_document_subjects(uuid, text, integer) to authenticated;

create or replace function public.list_document_records(
  target_school_id uuid,
  target_subject_type text default null,
  target_subject_id uuid default null,
  target_limit integer default 500
)
returns table (
  document_id uuid,
  branch_id uuid,
  branch_name text,
  subject_type text,
  subject_id uuid,
  subject_name text,
  category text,
  custom_label text,
  document_status text,
  object_path text,
  original_file_name text,
  mime_type text,
  size_bytes bigint,
  issued_on date,
  expires_on date,
  notes text,
  verified_by_name text,
  verified_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  can_manage boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if target_school_id is null
     or (target_subject_type is not null and target_subject_type not in ('student', 'registration_lead'))
     or (target_subject_id is not null and target_subject_type is null)
     or target_limit is null or target_limit < 1 or target_limit > 1000 then
    raise exception using errcode = '22023', message = 'documents_invalid_input';
  end if;

  return query
  select
    document.id,
    document.branch_id,
    branch.name,
    document.subject_type,
    coalesce(document.student_id, document.registration_lead_id),
    case
      when document.subject_type = 'student' then btrim(student.first_name || ' ' || student.last_name)
      else btrim(lead.prospect_first_name || ' ' || lead.prospect_last_name)
    end,
    document.category,
    document.custom_label,
    case
      when document.status in ('uploaded', 'verified')
       and document.expires_on is not null
       and document.expires_on < current_date then 'expired'::text
      else document.status
    end,
    document.object_path,
    document.original_file_name,
    document.mime_type,
    document.size_bytes,
    document.issued_on,
    document.expires_on,
    document.notes,
    verifier.full_name,
    document.verified_at,
    document.created_at,
    document.updated_at,
    (branch.status = 'active' and public.has_branch_permission(document.school_id, document.branch_id, 'documents.manage'))
  from public.document_records as document
  join public.branches as branch
    on branch.school_id = document.school_id and branch.id = document.branch_id
  left join public.students as student on student.id = document.student_id
  left join public.registration_leads as lead on lead.id = document.registration_lead_id
  left join public.profiles as verifier on verifier.id = document.verified_by
  where document.school_id = target_school_id
    and (target_subject_type is null or document.subject_type = target_subject_type)
    and (
      target_subject_id is null
      or coalesce(document.student_id, document.registration_lead_id) = target_subject_id
    )
    and (
      public.has_branch_permission(document.school_id, document.branch_id, 'documents.view')
      or public.has_branch_permission(document.school_id, document.branch_id, 'documents.manage')
    )
  order by document.updated_at desc, document.id desc
  limit target_limit;
end;
$$;

revoke all on function public.list_document_records(uuid, text, uuid, integer) from public, anon;
grant execute on function public.list_document_records(uuid, text, uuid, integer) to authenticated;

create or replace function public.create_document_slot(
  target_school_id uuid,
  target_subject_type text,
  target_subject_id uuid,
  target_category text,
  target_custom_label text default null,
  target_notes text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_branch_id uuid;
  normalized_custom_label text := nullif(btrim(target_custom_label), '');
  normalized_notes text := nullif(btrim(target_notes), '');
  new_document_id uuid;
begin
  if actor_id is null or not public.current_profile_is_active() then
    raise exception using errcode = '42501', message = 'documents_unauthorized';
  end if;

  if target_school_id is null
     or target_subject_id is null
     or target_subject_type not in ('student', 'registration_lead')
     or target_category not in (
       'birth_certificate', 'personal_photos', 'medical_report', 'previous_certificate',
       'guardian_identity', 'registration_form', 'other'
     )
     or (target_category = 'other' and (normalized_custom_label is null or char_length(normalized_custom_label) not between 2 and 120))
     or (target_category <> 'other' and normalized_custom_label is not null)
     or (normalized_notes is not null and char_length(normalized_notes) > 2000) then
    raise exception using errcode = '22023', message = 'documents_invalid_input';
  end if;

  if target_subject_type = 'student' then
    select student.branch_id into target_branch_id
    from public.students as student
    where student.id = target_subject_id and student.school_id = target_school_id;
  else
    select lead.branch_id into target_branch_id
    from public.registration_leads as lead
    where lead.id = target_subject_id and lead.school_id = target_school_id;
  end if;

  if target_branch_id is null
     or not exists (
       select 1 from public.branches as branch
       where branch.school_id = target_school_id
         and branch.id = target_branch_id
         and branch.status = 'active'
     )
     or not public.has_branch_permission(target_school_id, target_branch_id, 'documents.manage') then
    raise exception using errcode = '42501', message = 'documents_unauthorized';
  end if;

  insert into public.document_records (
    school_id, branch_id, subject_type, student_id, registration_lead_id,
    category, custom_label, status, notes, created_by, updated_by
  ) values (
    target_school_id,
    target_branch_id,
    target_subject_type,
    case when target_subject_type = 'student' then target_subject_id else null end,
    case when target_subject_type = 'registration_lead' then target_subject_id else null end,
    target_category,
    normalized_custom_label,
    'missing',
    normalized_notes,
    actor_id,
    actor_id
  )
  on conflict do nothing
  returning id into new_document_id;

  if new_document_id is null then
    select document.id into new_document_id
    from public.document_records as document
    where document.school_id = target_school_id
      and document.subject_type = target_subject_type
      and document.category = target_category
      and (
        (target_subject_type = 'student' and document.student_id = target_subject_id)
        or
        (target_subject_type = 'registration_lead' and document.registration_lead_id = target_subject_id)
      );
  else
    insert into public.document_events (
      document_id, school_id, branch_id, event_type, previous_status, new_status, actor_id
    ) values (
      new_document_id, target_school_id, target_branch_id, 'slot_created', null, 'missing', actor_id
    );
  end if;

  return new_document_id;
end;
$$;

revoke all on function public.create_document_slot(uuid, text, uuid, text, text, text) from public, anon;
grant execute on function public.create_document_slot(uuid, text, uuid, text, text, text) to authenticated;

create or replace function public.finalize_document_upload(
  target_document_id uuid,
  target_object_path text,
  target_original_file_name text,
  target_mime_type text,
  target_size_bytes bigint,
  target_issued_on date default null,
  target_expires_on date default null,
  target_notes text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  document_row public.document_records%rowtype;
  subject_id uuid;
  normalized_file_name text := nullif(btrim(target_original_file_name), '');
  normalized_notes text := nullif(btrim(target_notes), '');
  expected_prefix text;
  previous_path text;
  next_event_type text;
begin
  if actor_id is null or not public.current_profile_is_active() then
    raise exception using errcode = '42501', message = 'documents_unauthorized';
  end if;

  select document.* into document_row
  from public.document_records as document
  where document.id = target_document_id
  for update;

  if not found
     or not exists (
       select 1 from public.branches as branch
       where branch.school_id = document_row.school_id
         and branch.id = document_row.branch_id
         and branch.status = 'active'
     )
     or not public.has_branch_permission(document_row.school_id, document_row.branch_id, 'documents.manage') then
    raise exception using errcode = '42501', message = 'documents_unauthorized';
  end if;

  subject_id := coalesce(document_row.student_id, document_row.registration_lead_id);
  expected_prefix := document_row.school_id::text || '/' || document_row.subject_type || '/' || subject_id::text || '/' || document_row.id::text || '/';

  if target_object_path is null
     or target_object_path !~ '^[0-9a-f-]{36}/(student|registration_lead)/[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]+$'
     or left(target_object_path, char_length(expected_prefix)) <> expected_prefix
     or normalized_file_name is null or char_length(normalized_file_name) > 255
     or target_mime_type not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
     or target_size_bytes is null or target_size_bytes < 1 or target_size_bytes > 10485760
     or (target_issued_on is not null and target_expires_on is not null and target_expires_on < target_issued_on)
     or (normalized_notes is not null and char_length(normalized_notes) > 2000) then
    raise exception using errcode = '22023', message = 'documents_invalid_upload';
  end if;

  previous_path := document_row.object_path;
  next_event_type := case when previous_path is null then 'file_uploaded' else 'file_replaced' end;

  update public.document_records
  set object_path = target_object_path,
      original_file_name = normalized_file_name,
      mime_type = target_mime_type,
      size_bytes = target_size_bytes,
      issued_on = target_issued_on,
      expires_on = target_expires_on,
      notes = normalized_notes,
      status = 'uploaded',
      verified_by = null,
      verified_at = null,
      updated_by = actor_id
  where id = document_row.id;

  insert into public.document_events (
    document_id, school_id, branch_id, event_type, previous_status, new_status, actor_id
  ) values (
    document_row.id, document_row.school_id, document_row.branch_id,
    next_event_type, document_row.status, 'uploaded', actor_id
  );

  if document_row.subject_type = 'student' then
    update public.students
    set birth_certificate_provided = case when document_row.category = 'birth_certificate' then true else birth_certificate_provided end,
        photos_provided = case when document_row.category = 'personal_photos' then true else photos_provided end,
        medical_report_provided = case when document_row.category = 'medical_report' then true else medical_report_provided end,
        previous_certificate_provided = case when document_row.category = 'previous_certificate' then true else previous_certificate_provided end
    where id = document_row.student_id and school_id = document_row.school_id;
  end if;

  return previous_path;
end;
$$;

revoke all on function public.finalize_document_upload(uuid, text, text, text, bigint, date, date, text) from public, anon;
grant execute on function public.finalize_document_upload(uuid, text, text, text, bigint, date, date, text) to authenticated;

create or replace function public.update_document_status(
  target_document_id uuid,
  target_status text,
  target_expires_on date default null,
  target_notes text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  document_row public.document_records%rowtype;
  normalized_notes text := nullif(btrim(target_notes), '');
begin
  if actor_id is null or not public.current_profile_is_active() then
    raise exception using errcode = '42501', message = 'documents_unauthorized';
  end if;

  if target_status is null
     or target_status not in ('uploaded', 'verified', 'rejected', 'expired')
     or (normalized_notes is not null and char_length(normalized_notes) > 2000) then
    raise exception using errcode = '22023', message = 'documents_invalid_input';
  end if;

  select document.* into document_row
  from public.document_records as document
  where document.id = target_document_id
  for update;

  if not found
     or document_row.object_path is null
     or not exists (
       select 1 from public.branches as branch
       where branch.school_id = document_row.school_id
         and branch.id = document_row.branch_id
         and branch.status = 'active'
     )
     or not public.has_branch_permission(document_row.school_id, document_row.branch_id, 'documents.manage') then
    raise exception using errcode = '42501', message = 'documents_unauthorized';
  end if;

  if document_row.issued_on is not null and target_expires_on is not null and target_expires_on < document_row.issued_on then
    raise exception using errcode = '22023', message = 'documents_invalid_input';
  end if;

  update public.document_records
  set status = target_status,
      expires_on = target_expires_on,
      notes = normalized_notes,
      verified_by = case when target_status = 'verified' then actor_id else null end,
      verified_at = case when target_status = 'verified' then now() else null end,
      updated_by = actor_id
  where id = document_row.id;

  if document_row.status is distinct from target_status
     or document_row.expires_on is distinct from target_expires_on
     or document_row.notes is distinct from normalized_notes then
    insert into public.document_events (
      document_id, school_id, branch_id, event_type, previous_status, new_status, actor_id
    ) values (
      document_row.id, document_row.school_id, document_row.branch_id,
      'status_updated', document_row.status, target_status, actor_id
    );
  end if;

  return true;
end;
$$;

revoke all on function public.update_document_status(uuid, text, date, text) from public, anon;
grant execute on function public.update_document_status(uuid, text, date, text) to authenticated;

create or replace function public.list_document_events(target_document_id uuid)
returns table (
  event_id uuid,
  event_type text,
  previous_status text,
  new_status text,
  actor_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  document_row public.document_records%rowtype;
begin
  select document.* into document_row
  from public.document_records as document
  where document.id = target_document_id;

  if not found or not (
    public.has_branch_permission(document_row.school_id, document_row.branch_id, 'documents.view')
    or public.has_branch_permission(document_row.school_id, document_row.branch_id, 'documents.manage')
  ) then
    return;
  end if;

  return query
  select event.id, event.event_type, event.previous_status, event.new_status,
         actor.full_name, event.created_at
  from public.document_events as event
  join public.profiles as actor on actor.id = event.actor_id
  where event.document_id = target_document_id
  order by event.created_at desc, event.id desc;
end;
$$;

revoke all on function public.list_document_events(uuid) from public, anon;
grant execute on function public.list_document_events(uuid) to authenticated;

-- Private file bucket. Uploads are allowed only into a pre-created document slot.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'school-documents',
      'school-documents',
      false,
      10485760,
      array['application/pdf','image/jpeg','image/png','image/webp']::text[]
    )
    on conflict (id) do update
      set public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end
$$;

do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  execute 'drop policy if exists "school documents scoped read" on storage.objects';
  execute 'drop policy if exists "school documents scoped insert" on storage.objects';
  execute 'drop policy if exists "school documents scoped update" on storage.objects';
  execute 'drop policy if exists "school documents scoped delete" on storage.objects';

  execute $policy$
    create policy "school documents scoped read"
    on storage.objects for select to authenticated
    using (
      bucket_id = 'school-documents'
      and exists (
        select 1
        from public.document_records as document
        where document.school_id::text = (storage.foldername(name))[1]
          and document.subject_type = (storage.foldername(name))[2]
          and coalesce(document.student_id, document.registration_lead_id)::text = (storage.foldername(name))[3]
          and document.id::text = (storage.foldername(name))[4]
          and (
            public.has_branch_permission(document.school_id, document.branch_id, 'documents.view')
            or public.has_branch_permission(document.school_id, document.branch_id, 'documents.manage')
          )
      )
    )
  $policy$;

  execute $policy$
    create policy "school documents scoped insert"
    on storage.objects for insert to authenticated
    with check (
      bucket_id = 'school-documents'
      and exists (
        select 1
        from public.document_records as document
        join public.branches as branch
          on branch.school_id = document.school_id and branch.id = document.branch_id
        where branch.status = 'active'
          and document.school_id::text = (storage.foldername(name))[1]
          and document.subject_type = (storage.foldername(name))[2]
          and coalesce(document.student_id, document.registration_lead_id)::text = (storage.foldername(name))[3]
          and document.id::text = (storage.foldername(name))[4]
          and public.has_branch_permission(document.school_id, document.branch_id, 'documents.manage')
      )
    )
  $policy$;

  execute $policy$
    create policy "school documents scoped update"
    on storage.objects for update to authenticated
    using (
      bucket_id = 'school-documents'
      and exists (
        select 1
        from public.document_records as document
        join public.branches as branch
          on branch.school_id = document.school_id and branch.id = document.branch_id
        where branch.status = 'active'
          and document.school_id::text = (storage.foldername(name))[1]
          and document.subject_type = (storage.foldername(name))[2]
          and coalesce(document.student_id, document.registration_lead_id)::text = (storage.foldername(name))[3]
          and document.id::text = (storage.foldername(name))[4]
          and public.has_branch_permission(document.school_id, document.branch_id, 'documents.manage')
      )
    )
    with check (
      bucket_id = 'school-documents'
      and exists (
        select 1
        from public.document_records as document
        join public.branches as branch
          on branch.school_id = document.school_id and branch.id = document.branch_id
        where branch.status = 'active'
          and document.school_id::text = (storage.foldername(name))[1]
          and document.subject_type = (storage.foldername(name))[2]
          and coalesce(document.student_id, document.registration_lead_id)::text = (storage.foldername(name))[3]
          and document.id::text = (storage.foldername(name))[4]
          and public.has_branch_permission(document.school_id, document.branch_id, 'documents.manage')
      )
    )
  $policy$;

  execute $policy$
    create policy "school documents scoped delete"
    on storage.objects for delete to authenticated
    using (
      bucket_id = 'school-documents'
      and exists (
        select 1
        from public.document_records as document
        join public.branches as branch
          on branch.school_id = document.school_id and branch.id = document.branch_id
        where branch.status = 'active'
          and document.school_id::text = (storage.foldername(name))[1]
          and document.subject_type = (storage.foldername(name))[2]
          and coalesce(document.student_id, document.registration_lead_id)::text = (storage.foldername(name))[3]
          and document.id::text = (storage.foldername(name))[4]
          and public.has_branch_permission(document.school_id, document.branch_id, 'documents.manage')
      )
    )
  $policy$;
end
$$;

commit;
