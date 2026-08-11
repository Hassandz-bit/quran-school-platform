\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;

create schema auth;
create extension if not exists pgcrypto;

create table auth.users (
  id uuid primary key,
  email text unique
);

create or replace function auth.uid()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table public.schools (
  id uuid primary key,
  name text not null,
  status text not null
);

create table public.branches (
  id uuid primary key,
  school_id uuid not null references public.schools(id),
  name text not null,
  status text not null,
  unique (school_id, id)
);

create table public.profiles (
  id uuid primary key references auth.users(id),
  full_name text not null,
  status text not null
);

create table public.school_memberships (
  id uuid primary key,
  school_id uuid not null references public.schools(id),
  profile_id uuid not null references public.profiles(id),
  status text not null,
  unique (school_id, id),
  unique (school_id, profile_id)
);

create table public.roles (
  id uuid primary key,
  school_id uuid not null,
  code text not null,
  status text not null,
  unique (school_id, id),
  unique (school_id, code),
  foreign key (school_id) references public.schools(id)
);

create table public.permissions (
  id uuid primary key,
  code text not null unique
);

create table public.role_permissions (
  school_id uuid not null,
  role_id uuid not null,
  permission_id uuid not null references public.permissions(id),
  primary key (role_id, permission_id),
  foreign key (school_id, role_id) references public.roles(school_id, id)
);

create table public.membership_roles (
  id uuid primary key,
  school_id uuid not null,
  membership_id uuid not null,
  role_id uuid not null,
  branch_id uuid,
  foreign key (school_id, membership_id)
    references public.school_memberships(school_id, id),
  foreign key (school_id, role_id)
    references public.roles(school_id, id),
  foreign key (school_id, branch_id)
    references public.branches(school_id, id)
);

create table public.classes (
  id uuid primary key,
  school_id uuid not null,
  branch_id uuid not null,
  name text not null,
  status text not null,
  unique (school_id, branch_id, id),
  foreign key (school_id, branch_id)
    references public.branches(school_id, id)
);

create table public.students (
  id uuid primary key,
  school_id uuid not null,
  branch_id uuid not null,
  class_id uuid not null,
  first_name text not null,
  last_name text not null,
  status text not null,
  foreign key (school_id, branch_id, class_id)
    references public.classes(school_id, branch_id, id)
);

create table public.teachers (
  id uuid primary key,
  school_id uuid not null,
  branch_id uuid not null,
  profile_id uuid references public.profiles(id),
  first_name text not null,
  last_name text not null,
  status text not null,
  unique (school_id, branch_id, id),
  foreign key (school_id, branch_id)
    references public.branches(school_id, id)
);

create table public.class_teachers (
  id uuid primary key,
  school_id uuid not null,
  branch_id uuid not null,
  class_id uuid not null,
  teacher_id uuid not null,
  status text not null,
  foreign key (school_id, branch_id, class_id)
    references public.classes(school_id, branch_id, id),
  foreign key (school_id, branch_id, teacher_id)
    references public.teachers(school_id, branch_id, id)
);

create table public.memorization_records (
  id uuid primary key,
  school_id uuid not null,
  branch_id uuid not null,
  class_id uuid not null,
  student_id uuid not null,
  teacher_id uuid not null,
  record_date date not null,
  foreign key (school_id, branch_id, class_id)
    references public.classes(school_id, branch_id, id),
  foreign key (student_id) references public.students(id),
  foreign key (teacher_id) references public.teachers(id)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.quran_surah_ayah_count(input_surah_number smallint)
returns smallint
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when input_surah_number = 1 then 7::smallint
    when input_surah_number = 2 then 286::smallint
    when input_surah_number between 3 and 114 then 200::smallint
    else null
  end;
$$;

create or replace function public.is_active_school_member(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as profile
    join public.school_memberships as membership
      on membership.profile_id = profile.id
     and membership.school_id = target_school_id
     and membership.status = 'active'
    where profile.id = (select auth.uid())
      and profile.status = 'active'
  );
$$;

create or replace function public.can_access_memorization_class(
  target_school_id uuid,
  target_branch_id uuid,
  target_class_id uuid,
  target_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_permission_code in ('memorization.view', 'memorization.manage')
    and public.is_active_school_member(target_school_id)
    and exists (
      select 1
      from public.classes as target_class
      where target_class.school_id = target_school_id
        and target_class.branch_id = target_branch_id
        and target_class.id = target_class_id
        and target_class.status = 'active'
    )
    and (
      exists (
        select 1
        from public.school_memberships as membership
        join public.membership_roles as membership_role
          on membership_role.school_id = membership.school_id
         and membership_role.membership_id = membership.id
        join public.roles as role
          on role.school_id = membership_role.school_id
         and role.id = membership_role.role_id
         and role.status = 'active'
        join public.role_permissions as role_permission
          on role_permission.school_id = role.school_id
         and role_permission.role_id = role.id
        join public.permissions as permission
          on permission.id = role_permission.permission_id
        where membership.school_id = target_school_id
          and membership.profile_id = (select auth.uid())
          and membership.status = 'active'
          and role.code <> 'teacher'
          and permission.code = target_permission_code
          and (
            membership_role.branch_id is null
            or membership_role.branch_id = target_branch_id
          )
      )
      or (
        exists (
          select 1
          from public.school_memberships as membership
          join public.membership_roles as membership_role
            on membership_role.school_id = membership.school_id
           and membership_role.membership_id = membership.id
          join public.roles as role
            on role.school_id = membership_role.school_id
           and role.id = membership_role.role_id
           and role.status = 'active'
          join public.role_permissions as role_permission
            on role_permission.school_id = role.school_id
           and role_permission.role_id = role.id
          join public.permissions as permission
            on permission.id = role_permission.permission_id
          where membership.school_id = target_school_id
            and membership.profile_id = (select auth.uid())
            and membership.status = 'active'
            and role.code = 'teacher'
            and permission.code = target_permission_code
            and (
              membership_role.branch_id is null
              or membership_role.branch_id = target_branch_id
            )
        )
        and exists (
          select 1
          from public.teachers as teacher
          join public.class_teachers as class_teacher
            on class_teacher.school_id = teacher.school_id
           and class_teacher.branch_id = teacher.branch_id
           and class_teacher.teacher_id = teacher.id
           and class_teacher.status = 'active'
          where teacher.school_id = target_school_id
            and teacher.branch_id = target_branch_id
            and teacher.profile_id = (select auth.uid())
            and teacher.status = 'active'
            and class_teacher.class_id = target_class_id
        )
      )
    );
$$;

insert into public.schools (id, name, status) values
  ('10000000-0000-4000-8000-000000000001', 'School One', 'active'),
  ('10000000-0000-4000-8000-000000000002', 'School Two', 'active');

insert into public.branches (id, school_id, name, status) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Branch One', 'active'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Branch Two', 'active');

insert into public.classes (id, school_id, branch_id, name, status) values
  ('21000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Class One', 'active'),
  ('21000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Class Two', 'active');

insert into auth.users (id, email) values
  ('30000000-0000-4000-8000-000000000001', 'teacher@example.test'),
  ('30000000-0000-4000-8000-000000000002', 'supervisor@example.test'),
  ('30000000-0000-4000-8000-000000000003', 'admin@example.test'),
  ('30000000-0000-4000-8000-000000000004', 'member@example.test'),
  ('30000000-0000-4000-8000-000000000005', 'second-teacher@example.test');

insert into public.profiles (id, full_name, status) values
  ('30000000-0000-4000-8000-000000000001', 'Teacher User', 'active'),
  ('30000000-0000-4000-8000-000000000002', 'Supervisor User', 'active'),
  ('30000000-0000-4000-8000-000000000003', 'Admin User', 'active'),
  ('30000000-0000-4000-8000-000000000004', 'No Permission User', 'active'),
  ('30000000-0000-4000-8000-000000000005', 'Second Teacher', 'active');

insert into public.school_memberships (id, school_id, profile_id, status) values
  ('31000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'active'),
  ('31000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'active'),
  ('31000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', 'active'),
  ('31000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000004', 'active'),
  ('31000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000005', 'active');

insert into public.roles (id, school_id, code, status) values
  ('32000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'teacher', 'active'),
  ('32000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'academic_supervisor', 'active'),
  ('32000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'school_admin', 'active'),
  ('32000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'member', 'active');

insert into public.permissions (id, code) values
  ('33000000-0000-4000-8000-000000000001', 'memorization.view'),
  ('33000000-0000-4000-8000-000000000002', 'memorization.manage');

insert into public.role_permissions (school_id, role_id, permission_id) values
  ('10000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000002', '33000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000003', '33000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000003', '33000000-0000-4000-8000-000000000002');

insert into public.membership_roles (id, school_id, membership_id, role_id, branch_id) values
  ('34000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'),
  ('34000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001'),
  ('34000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000003', '32000000-0000-4000-8000-000000000003', null),
  ('34000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000004', '32000000-0000-4000-8000-000000000004', null),
  ('34000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000005', '32000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');

insert into public.teachers (id, school_id, branch_id, profile_id, first_name, last_name, status) values
  ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Assigned', 'Teacher', 'active'),
  ('50000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000005', 'Second', 'Teacher', 'active'),
  ('50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', null, 'Other', 'Teacher', 'active');

insert into public.class_teachers (id, school_id, branch_id, class_id, teacher_id, status) values
  ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'active'),
  ('60000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000005', 'active'),
  ('60000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', 'active');

insert into public.students (id, school_id, branch_id, class_id, first_name, last_name, status) values
  ('70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'Student', 'One', 'active'),
  ('70000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002', 'Student', 'Two', 'active');

insert into public.memorization_records (
  id, school_id, branch_id, class_id, student_id, teacher_id, record_date
) values (
  '80000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  current_date
);
