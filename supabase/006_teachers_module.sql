-- Quran School SaaS - teachers module
-- Adds tenant-isolated teachers, class assignments, permissions, privileges, and RLS.

begin;

-- Teachers belong to exactly one branch inside one school. A profile link is
-- optional and reserved for a future trusted account-linking workflow.
create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  branch_id uuid not null,
  profile_id uuid,
  first_name text not null,
  last_name text not null,
  gender text not null,
  phone text,
  email text,
  specialization text,
  qualification text,
  hire_date date not null default current_date,
  status text not null default 'active',
  notes text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teachers_school_fk
    foreign key (school_id) references public.schools(id),
  constraint teachers_branch_school_fk
    foreign key (school_id, branch_id)
    references public.branches(school_id, id),
  constraint teachers_profile_fk
    foreign key (profile_id) references public.profiles(id),
  constraint teachers_created_by_fk
    foreign key (created_by) references public.profiles(id),
  constraint teachers_first_name_length_check
    check (char_length(btrim(first_name)) between 2 and 100),
  constraint teachers_last_name_length_check
    check (char_length(btrim(last_name)) between 2 and 100),
  constraint teachers_gender_check
    check (gender in ('male', 'female')),
  constraint teachers_phone_nonblank_check
    check (phone is null or btrim(phone) <> ''),
  constraint teachers_email_nonblank_check
    check (email is null or btrim(email) <> ''),
  constraint teachers_specialization_nonblank_check
    check (specialization is null or btrim(specialization) <> ''),
  constraint teachers_qualification_nonblank_check
    check (qualification is null or btrim(qualification) <> ''),
  constraint teachers_notes_nonblank_check
    check (notes is null or btrim(notes) <> ''),
  constraint teachers_status_check
    check (status in ('active', 'inactive', 'on_leave', 'archived')),
  constraint teachers_school_id_id_unique unique (school_id, id),
  constraint teachers_school_branch_id_unique unique (school_id, branch_id, id)
);

comment on table public.teachers is
  'Teacher records isolated by school_id and constrained to a branch in the same school.';
comment on column public.teachers.school_id is
  'Tenant boundary; immutable through browser UPDATE privileges.';
comment on column public.teachers.branch_id is
  'Required branch in the same school, enforced by a composite foreign key.';
comment on column public.teachers.profile_id is
  'Optional future Auth profile link; browser INSERT and UPDATE privileges intentionally exclude it.';
comment on column public.teachers.status is
  'Teacher lifecycle state; archived replaces browser-side deletion.';
comment on column public.teachers.created_by is
  'Supabase Auth user profile that created the teacher; immutable through browser UPDATE privileges.';

-- One profile may represent at most one teacher in the same school.
create unique index teachers_school_profile_unique_idx
  on public.teachers (school_id, profile_id)
  where profile_id is not null;

-- Class assignments preserve both tenant and branch boundaries for the class
-- and teacher. Rows are deactivated instead of deleted from the browser.
create table public.class_teachers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  branch_id uuid not null,
  class_id uuid not null,
  teacher_id uuid not null,
  assignment_role text not null default 'primary',
  status text not null default 'active',
  assigned_at date not null default current_date,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_teachers_class_branch_school_fk
    foreign key (school_id, branch_id, class_id)
    references public.classes(school_id, branch_id, id),
  constraint class_teachers_teacher_branch_school_fk
    foreign key (school_id, branch_id, teacher_id)
    references public.teachers(school_id, branch_id, id),
  constraint class_teachers_created_by_fk
    foreign key (created_by) references public.profiles(id),
  constraint class_teachers_assignment_role_check
    check (assignment_role in ('primary', 'assistant')),
  constraint class_teachers_status_check
    check (status in ('active', 'inactive')),
  constraint class_teachers_class_teacher_unique
    unique (class_id, teacher_id)
);

comment on table public.class_teachers is
  'Teacher assignments to Quran classes, constrained to the same school and branch.';
comment on column public.class_teachers.school_id is
  'Tenant boundary; immutable through browser UPDATE privileges.';
comment on column public.class_teachers.branch_id is
  'Shared branch boundary enforced for both the class and teacher.';
comment on column public.class_teachers.class_id is
  'Assigned class in the same school and branch as this row.';
comment on column public.class_teachers.teacher_id is
  'Assigned teacher in the same school and branch as this row.';
comment on column public.class_teachers.assignment_role is
  'Teacher responsibility in the class: primary or assistant.';
comment on column public.class_teachers.status is
  'Assignment lifecycle state; inactive replaces browser-side deletion.';
comment on column public.class_teachers.created_by is
  'Supabase Auth user profile that created the assignment; immutable through browser UPDATE privileges.';

-- Only one active primary teacher may be assigned to a class at a time.
create unique index class_teachers_one_active_primary_per_class_idx
  on public.class_teachers (class_id)
  where assignment_role = 'primary' and status = 'active';

-- Tenant-scoped filtering and foreign-key lookup indexes.
create index teachers_school_branch_status_idx
  on public.teachers (school_id, branch_id, status);

create index teachers_school_name_idx
  on public.teachers (school_id, last_name, first_name);

create index teachers_profile_id_idx
  on public.teachers (profile_id)
  where profile_id is not null;

create index teachers_created_by_idx
  on public.teachers (created_by);

create index class_teachers_school_branch_status_idx
  on public.class_teachers (school_id, branch_id, status);

create index class_teachers_school_class_status_idx
  on public.class_teachers (school_id, class_id, status);

create index class_teachers_school_teacher_status_idx
  on public.class_teachers (school_id, teacher_id, status);

create index class_teachers_created_by_idx
  on public.class_teachers (created_by);

-- Reuse the foundation trigger function so timestamps cannot depend on clients.
create trigger teachers_set_updated_at
before update on public.teachers
for each row execute function public.set_updated_at();

create trigger class_teachers_set_updated_at
before update on public.class_teachers
for each row execute function public.set_updated_at();

-- Add the global permission catalogue entries without fixed UUIDs.
insert into public.permissions (code, module, name_ar, description)
values
  ('teachers.view', 'teachers', 'عرض المعلمين', 'عرض معلمي المدرسة والفروع المصرح بها'),
  ('teachers.manage', 'teachers', 'إدارة المعلمين', 'إضافة المعلمين وتعديلهم وأرشفتهم وتعيينهم للحلقات')
on conflict (code) do update
set module = excluded.module,
    name_ar = excluded.name_ar,
    description = excluded.description;

-- Apply grants by role code to every school that contains the role.
with grants (role_code, permission_code) as (
  values
    ('school_admin', 'teachers.view'),
    ('school_admin', 'teachers.manage'),
    ('branch_manager', 'teachers.view'),
    ('branch_manager', 'teachers.manage'),
    ('academic_supervisor', 'teachers.view'),
    ('academic_supervisor', 'teachers.manage')
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
alter table public.teachers enable row level security;
alter table public.class_teachers enable row level security;

revoke all on public.teachers, public.class_teachers
from public, anon, authenticated;

grant select on public.teachers to authenticated;

grant insert (
  school_id,
  branch_id,
  first_name,
  last_name,
  gender,
  phone,
  email,
  specialization,
  qualification,
  hire_date,
  status,
  notes
) on public.teachers to authenticated;

grant update (
  branch_id,
  first_name,
  last_name,
  gender,
  phone,
  email,
  specialization,
  qualification,
  hire_date,
  status,
  notes
) on public.teachers to authenticated;

grant select on public.class_teachers to authenticated;

grant insert (
  school_id,
  branch_id,
  class_id,
  teacher_id,
  assignment_role,
  status,
  assigned_at
) on public.class_teachers to authenticated;

grant update (
  branch_id,
  class_id,
  teacher_id,
  assignment_role,
  status,
  assigned_at
) on public.class_teachers to authenticated;

-- TEACHERS: branch permission grants read or management in the target branch.
create policy teachers_select_authorized on public.teachers
for select to authenticated
using (
  public.has_branch_permission(school_id, branch_id, 'teachers.view')
);

create policy teachers_insert_authorized on public.teachers
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and public.has_branch_permission(school_id, branch_id, 'teachers.manage')
);

create policy teachers_update_authorized on public.teachers
for update to authenticated
using (
  public.has_branch_permission(school_id, branch_id, 'teachers.manage')
)
with check (
  public.has_branch_permission(school_id, branch_id, 'teachers.manage')
);

-- No DELETE policy: teachers are archived through status instead.

-- CLASS TEACHERS: use the teacher-module permission in the assignment branch.
create policy class_teachers_select_authorized on public.class_teachers
for select to authenticated
using (
  public.has_branch_permission(school_id, branch_id, 'teachers.view')
);

create policy class_teachers_insert_authorized on public.class_teachers
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and public.has_branch_permission(school_id, branch_id, 'teachers.manage')
);

create policy class_teachers_update_authorized on public.class_teachers
for update to authenticated
using (
  public.has_branch_permission(school_id, branch_id, 'teachers.manage')
)
with check (
  public.has_branch_permission(school_id, branch_id, 'teachers.manage')
);

-- No DELETE policy: class assignments are deactivated through status instead.

commit;
