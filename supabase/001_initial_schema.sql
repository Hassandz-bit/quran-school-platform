-- Quran School SaaS - Supabase foundation schema (phase 1)
-- Scope: tenants, branches, user profiles, memberships, roles and permissions only.

begin;

create extension if not exists pgcrypto;

-- Keeps updated_at consistent without relying on the React client.
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

-- Each row is one tenant. Tenant-owned rows reference schools.id.
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 150),
  slug text not null check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'active' check (status in ('active', 'inactive', 'suspended')),
  default_locale text not null default 'ar' check (default_locale in ('ar', 'en')),
  timezone text not null default 'Africa/Algiers',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schools_slug_unique unique (slug)
);

comment on table public.schools is 'SaaS tenants; every tenant-owned record is isolated by school_id.';
comment on column public.schools.slug is 'Stable URL-safe tenant identifier; globally unique.';
comment on column public.schools.status is 'Suspended or inactive schools are denied tenant data access by RLS helpers.';

-- Physical or organizational branches belonging to exactly one school.
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 150),
  code text not null check (char_length(btrim(code)) between 1 and 40 and code = upper(code) and code ~ '^[A-Z0-9_-]+$'),
  status text not null default 'active' check (status in ('active', 'inactive')),
  is_main boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branches_school_code_unique unique (school_id, code),
  constraint branches_school_id_id_unique unique (school_id, id)
);

comment on table public.branches is 'Branches are tenant-owned and cannot exist without a school.';
comment on column public.branches.is_main is 'At most one main branch is allowed per school by a partial unique index.';

-- Public application profile paired one-to-one with Supabase Auth.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 150),
  avatar_url text,
  phone text,
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Application-visible user data; credentials remain exclusively in auth.users.';
comment on column public.profiles.id is 'Exactly the corresponding auth.users.id; never stores passwords.';
comment on column public.profiles.status is 'A disabled profile is denied tenant access even if a membership is active.';

-- A user may belong to many schools, with an independent status in each.
create table public.school_memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended', 'revoked')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_memberships_school_profile_unique unique (school_id, profile_id),
  constraint school_memberships_school_id_id_unique unique (school_id, id),
  constraint school_memberships_joined_at_check check (status <> 'active' or joined_at is not null)
);

comment on table public.school_memberships is 'Tenant boundary between a global profile and a school.';
comment on column public.school_memberships.status is 'Only active memberships participate in authorization.';

-- Roles are tenant-owned so each school may customize its authorization model.
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  code text not null check (code = lower(code) and code ~ '^[a-z][a-z0-9_]*$'),
  name_ar text not null check (char_length(btrim(name_ar)) between 2 and 100),
  description text,
  is_system boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roles_school_code_unique unique (school_id, code),
  constraint roles_school_id_id_unique unique (school_id, id)
);

comment on table public.roles is 'School-specific roles; is_system marks seeded roles that should not be casually deleted.';

-- Global, code-defined permission catalogue. It contains no tenant data.
create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code = lower(code) and code ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  module text not null check (module = lower(module) and module ~ '^[a-z][a-z0-9_]*$'),
  name_ar text not null check (char_length(btrim(name_ar)) between 2 and 120),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint permissions_code_unique unique (code)
);

comment on table public.permissions is 'Global permission catalogue addressed by stable machine-readable codes.';

-- Many-to-many mapping between a tenant role and global permissions.
create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  role_id uuid not null,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint role_permissions_role_school_fk
    foreign key (school_id, role_id) references public.roles(school_id, id) on delete cascade,
  constraint role_permissions_role_permission_unique unique (role_id, permission_id)
);

comment on table public.role_permissions is 'Permission grants for roles; school_id makes the tenant boundary explicit and verifiable.';

-- Assign a role to a membership across a whole school or within one branch.
create table public.membership_roles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  membership_id uuid not null,
  role_id uuid not null,
  branch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_roles_membership_school_fk
    foreign key (school_id, membership_id)
    references public.school_memberships(school_id, id) on delete cascade,
  constraint membership_roles_role_school_fk
    foreign key (school_id, role_id)
    references public.roles(school_id, id) on delete cascade,
  constraint membership_roles_branch_school_fk
    foreign key (school_id, branch_id)
    references public.branches(school_id, id) on delete cascade
);

comment on table public.membership_roles is 'Role assignment; null branch_id means school-wide, otherwise the role is branch-scoped.';
comment on column public.membership_roles.school_id is 'Redundant by design: composite foreign keys prevent cross-tenant assignments.';

-- A school may have only one main branch.
create unique index branches_one_main_per_school_idx
  on public.branches (school_id)
  where is_main;

-- PostgreSQL treats nulls as distinct, so separate indexes prevent duplicate
-- school-wide and duplicate branch-specific role assignments.
create unique index membership_roles_school_scope_unique_idx
  on public.membership_roles (membership_id, role_id)
  where branch_id is null;

create unique index membership_roles_branch_scope_unique_idx
  on public.membership_roles (membership_id, role_id, branch_id)
  where branch_id is not null;

-- Foreign-key and RLS lookup indexes.
create index branches_school_status_idx on public.branches (school_id, status);
create index memberships_profile_status_idx on public.school_memberships (profile_id, status);
create index memberships_school_status_idx on public.school_memberships (school_id, status);
create index roles_school_status_idx on public.roles (school_id, status);
create index role_permissions_school_role_idx on public.role_permissions (school_id, role_id);
create index role_permissions_permission_idx on public.role_permissions (permission_id);
create index membership_roles_school_membership_idx on public.membership_roles (school_id, membership_id);
create index membership_roles_school_role_idx on public.membership_roles (school_id, role_id);
create index membership_roles_branch_idx on public.membership_roles (branch_id) where branch_id is not null;

create trigger schools_set_updated_at before update on public.schools
for each row execute function public.set_updated_at();
create trigger branches_set_updated_at before update on public.branches
for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger memberships_set_updated_at before update on public.school_memberships
for each row execute function public.set_updated_at();
create trigger roles_set_updated_at before update on public.roles
for each row execute function public.set_updated_at();
create trigger permissions_set_updated_at before update on public.permissions
for each row execute function public.set_updated_at();
create trigger role_permissions_set_updated_at before update on public.role_permissions
for each row execute function public.set_updated_at();
create trigger membership_roles_set_updated_at before update on public.membership_roles
for each row execute function public.set_updated_at();

commit;
