create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

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
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table public.schools (
  id uuid primary key,
  name text not null,
  status text not null,
  unique (id)
);

create table public.branches (
  id uuid primary key,
  school_id uuid not null references public.schools(id),
  name text not null,
  status text not null,
  unique (school_id, id)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null constraint profiles_full_name_check
    check (char_length(btrim(full_name)) between 2 and 150),
  locale text not null default 'ar',
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.school_memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  profile_id uuid not null references public.profiles(id),
  status text not null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, profile_id),
  unique (school_id, id)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  code text not null,
  name_ar text not null,
  status text not null,
  unique (school_id, code),
  unique (school_id, id)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
);

create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  role_id uuid not null,
  permission_id uuid not null references public.permissions(id),
  unique (role_id, permission_id),
  foreign key (school_id, role_id) references public.roles(school_id, id)
);

create table public.membership_roles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  membership_id uuid not null,
  role_id uuid not null,
  branch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, membership_id) references public.school_memberships(school_id, id),
  foreign key (school_id, role_id) references public.roles(school_id, id),
  foreign key (school_id, branch_id) references public.branches(school_id, id)
);

create unique index membership_roles_school_scope_unique_idx
  on public.membership_roles (membership_id, role_id)
  where branch_id is null;
create unique index membership_roles_branch_scope_unique_idx
  on public.membership_roles (membership_id, role_id, branch_id)
  where branch_id is not null;

create table public.teachers (
  id uuid primary key,
  school_id uuid not null,
  branch_id uuid not null,
  profile_id uuid references public.profiles(id),
  first_name text not null check (char_length(btrim(first_name)) between 1 and 100),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 100),
  email text,
  status text not null,
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id, branch_id, id),
  foreign key (school_id, branch_id) references public.branches(school_id, id)
);

create unique index teachers_school_profile_unique_idx
  on public.teachers (school_id, profile_id)
  where profile_id is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.has_school_permission(
  target_school_id uuid,
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
    from public.profiles as profile
    join public.school_memberships as membership
      on membership.profile_id = profile.id
     and membership.school_id = target_school_id
     and membership.status = 'active'
    join public.membership_roles as assignment
      on assignment.school_id = membership.school_id
     and assignment.membership_id = membership.id
     and assignment.branch_id is null
    join public.roles as role
      on role.school_id = assignment.school_id
     and role.id = assignment.role_id
     and role.status = 'active'
    join public.role_permissions as role_permission
      on role_permission.school_id = role.school_id
     and role_permission.role_id = role.id
    join public.permissions as permission
      on permission.id = role_permission.permission_id
    where profile.id = auth.uid()
      and profile.status = 'active'
      and permission.code = target_permission_code
  );
$$;
