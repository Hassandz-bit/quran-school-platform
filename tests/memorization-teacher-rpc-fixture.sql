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
  school_id uuid not null references public.schools(id),
  code text not null,
  status text not null,
  unique (school_id, id),
  unique (school_id, code)
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

create table public.teachers (
  id uuid primary key,
  school_id uuid not null,
  branch_id uuid not null,
  profile_id uuid references public.profiles(id),
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
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
  assignment_role text not null,
  status text not null,
  foreign key (school_id, branch_id, class_id)
    references public.classes(school_id, branch_id, id),
  foreign key (school_id, branch_id, teacher_id)
    references public.teachers(school_id, branch_id, id)
);

create or replace function public.is_active_school_member(
  target_school_id uuid
)
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
    where profile.id = auth.uid()
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
          and membership.profile_id = auth.uid()
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
            and membership.profile_id = auth.uid()
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
            and teacher.profile_id = auth.uid()
            and teacher.status = 'active'
            and class_teacher.class_id = target_class_id
        )
      )
    );
$$;

revoke all on function public.is_active_school_member(uuid) from public;
revoke all on function public.can_access_memorization_class(uuid, uuid, uuid, text)
from public;
grant execute on function public.can_access_memorization_class(uuid, uuid, uuid, text)
to authenticated;

alter table public.teachers enable row level security;
alter table public.class_teachers enable row level security;

revoke all on public.teachers, public.class_teachers
from public, anon, authenticated;
grant select on public.teachers, public.class_teachers to authenticated;
