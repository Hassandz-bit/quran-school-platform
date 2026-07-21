-- Quran School SaaS - students and classes module
-- Adds tenant-isolated classes, students, permissions, privileges, and RLS.

begin;

-- Quran classes belong to exactly one branch inside one school.
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  branch_id uuid not null,
  name text not null,
  code text not null,
  schedule_label text,
  status text not null default 'active',
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classes_school_fk
    foreign key (school_id) references public.schools(id),
  constraint classes_branch_school_fk
    foreign key (school_id, branch_id)
    references public.branches(school_id, id),
  constraint classes_created_by_fk
    foreign key (created_by) references public.profiles(id),
  constraint classes_name_length_check
    check (char_length(btrim(name)) between 2 and 150),
  constraint classes_code_format_check
    check (code = upper(code) and code ~ '^[A-Z0-9_]+$'),
  constraint classes_status_check
    check (status in ('active', 'inactive', 'archived')),
  constraint classes_school_code_unique unique (school_id, code),
  constraint classes_school_id_id_unique unique (school_id, id),
  constraint classes_school_branch_id_unique unique (school_id, branch_id, id)
);

comment on table public.classes is
  'Quran classes isolated by school_id and constrained to a branch in the same school.';
comment on column public.classes.school_id is
  'Tenant boundary; immutable through browser UPDATE privileges.';
comment on column public.classes.branch_id is
  'Branch in the same school, enforced by a composite foreign key.';
comment on column public.classes.code is
  'School-unique code containing uppercase English letters, digits, and underscores only.';
comment on column public.classes.status is
  'Lifecycle state; archived replaces browser-side deletion.';
comment on column public.classes.created_by is
  'Supabase Auth user profile that created the class; immutable through browser UPDATE privileges.';

-- Students belong to one school and branch and may optionally join a class in
-- that exact same school and branch.
create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  branch_id uuid not null,
  class_id uuid,
  first_name text not null,
  last_name text not null,
  birth_date date not null,
  gender text not null,
  national_id text,
  phone text,
  email text,
  address text,
  previous_school text,
  education_level text,
  guardian_name text not null,
  guardian_relation text not null,
  guardian_phone text not null,
  guardian_email text,
  guardian_job text,
  start_date date not null default current_date,
  status text not null default 'active',
  birth_certificate_provided boolean not null default false,
  photos_provided boolean not null default false,
  medical_report_provided boolean not null default false,
  previous_certificate_provided boolean not null default false,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint students_branch_school_fk
    foreign key (school_id, branch_id)
    references public.branches(school_id, id),
  constraint students_class_branch_school_fk
    foreign key (school_id, branch_id, class_id)
    references public.classes(school_id, branch_id, id),
  constraint students_created_by_fk
    foreign key (created_by) references public.profiles(id),
  constraint students_first_name_length_check
    check (char_length(btrim(first_name)) between 2 and 100),
  constraint students_last_name_length_check
    check (char_length(btrim(last_name)) between 2 and 100),
  constraint students_gender_check
    check (gender in ('male', 'female')),
  constraint students_guardian_relation_check
    check (
      guardian_relation in (
        'father',
        'mother',
        'brother',
        'sister',
        'uncle',
        'aunt',
        'grandfather',
        'grandmother',
        'other'
      )
    ),
  constraint students_status_check
    check (
      status in (
        'active',
        'suspended',
        'transferred',
        'graduated',
        'withdrawn'
      )
    )
);

comment on table public.students is
  'Student records isolated by school_id; authentication credentials are never stored here.';
comment on column public.students.school_id is
  'Tenant boundary; immutable through browser UPDATE privileges.';
comment on column public.students.branch_id is
  'Required branch in the same school, enforced by a composite foreign key.';
comment on column public.students.class_id is
  'Optional class; when present it must belong to the same school and branch as the student.';
comment on column public.students.national_id is
  'Optional identifier; nonblank values are unique inside each school.';
comment on column public.students.status is
  'Enrollment lifecycle state; status changes replace browser-side deletion.';
comment on column public.students.created_by is
  'Supabase Auth user profile that created the student; immutable through browser UPDATE privileges.';

-- Lookup and tenant-scoped filtering indexes.
create index classes_school_branch_status_idx
  on public.classes (school_id, branch_id, status);

create index students_school_branch_status_idx
  on public.students (school_id, branch_id, status);

create index students_school_class_status_idx
  on public.students (school_id, class_id, status);

create index students_school_name_idx
  on public.students (school_id, last_name, first_name);

create unique index students_school_national_id_unique_idx
  on public.students (school_id, national_id)
  where national_id is not null and btrim(national_id) <> '';

-- Reuse the foundation trigger function so timestamps cannot depend on clients.
create trigger classes_set_updated_at
before update on public.classes
for each row execute function public.set_updated_at();

create trigger students_set_updated_at
before update on public.students
for each row execute function public.set_updated_at();

-- Add the global permission catalogue entries without fixed UUIDs.
insert into public.permissions (code, module, name_ar, description)
values
  ('classes.view', 'classes', 'عرض الحلقات', 'عرض حلقات المدرسة والفروع المصرح بها'),
  ('classes.manage', 'classes', 'إدارة الحلقات', 'إنشاء الحلقات وتعديلها وأرشفتها'),
  ('students.view', 'students', 'عرض الطلاب', 'عرض طلاب المدرسة والفروع المصرح بها'),
  ('students.manage', 'students', 'إدارة الطلاب', 'تسجيل الطلاب وتعديل بياناتهم وحالتهم')
on conflict (code) do update
set module = excluded.module,
    name_ar = excluded.name_ar,
    description = excluded.description;

-- Apply grants by role code to every school that contains the role.
with grants (role_code, permission_code) as (
  values
    ('school_admin', 'classes.view'),
    ('school_admin', 'classes.manage'),
    ('school_admin', 'students.view'),
    ('school_admin', 'students.manage'),
    ('branch_manager', 'classes.view'),
    ('branch_manager', 'classes.manage'),
    ('branch_manager', 'students.view'),
    ('branch_manager', 'students.manage'),
    ('academic_supervisor', 'classes.view'),
    ('academic_supervisor', 'students.view'),
    ('teacher', 'classes.view'),
    ('teacher', 'students.view'),
    ('registrar', 'classes.view'),
    ('registrar', 'students.view'),
    ('registrar', 'students.manage')
)
insert into public.role_permissions (school_id, role_id, permission_id)
select role.school_id, role.id, permission.id
from grants as role_grant
join public.roles as role
  on role.code = role_grant.role_code
join public.permissions as permission
  on permission.code = role_grant.permission_code
on conflict (role_id, permission_id) do nothing;

-- Browser access is deny-by-default, with RLS and explicit column privileges.
alter table public.classes enable row level security;
alter table public.students enable row level security;

revoke all on public.classes, public.students
from public, anon, authenticated;

grant select, insert on public.classes to authenticated;
grant update (branch_id, name, code, schedule_label, status)
  on public.classes to authenticated;

grant select, insert on public.students to authenticated;
grant update (
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
  previous_certificate_provided
) on public.students to authenticated;

-- CLASSES: branch permission grants read or management in the target branch.
create policy classes_select_authorized on public.classes
for select to authenticated
using (
  public.has_branch_permission(school_id, branch_id, 'classes.view')
);

create policy classes_insert_authorized on public.classes
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and public.has_branch_permission(school_id, branch_id, 'classes.manage')
);

create policy classes_update_authorized on public.classes
for update to authenticated
using (
  public.has_branch_permission(school_id, branch_id, 'classes.manage')
)
with check (
  public.has_branch_permission(school_id, branch_id, 'classes.manage')
);

-- No DELETE policy: classes are archived through status instead.

-- STUDENTS: branch permission grants read or management in the target branch.
create policy students_select_authorized on public.students
for select to authenticated
using (
  public.has_branch_permission(school_id, branch_id, 'students.view')
);

create policy students_insert_authorized on public.students
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and public.has_branch_permission(school_id, branch_id, 'students.manage')
);

create policy students_update_authorized on public.students
for update to authenticated
using (
  public.has_branch_permission(school_id, branch_id, 'students.manage')
)
with check (
  public.has_branch_permission(school_id, branch_id, 'students.manage')
);

-- No DELETE policy: students move through lifecycle statuses instead.

commit;
