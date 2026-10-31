-- Managed duwams: a named schedule container within a branch.
-- Existing class schedules remain intact; classes are linked only when an administrator assigns them.
begin;

create table if not exists public.duwams (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  branch_id uuid not null,
  name text not null,
  study_days text[] not null default '{}',
  start_time time not null,
  end_time time not null,
  status text not null default 'active',
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint duwams_branch_scope_fk
    foreign key (school_id, branch_id)
    references public.branches(school_id, id) on delete cascade,
  constraint duwams_name_length_check
    check (char_length(btrim(name)) between 2 and 120),
  constraint duwams_study_days_check
    check (study_days <@ array['sunday','monday','tuesday','wednesday','thursday','friday','saturday']::text[] and cardinality(study_days) > 0),
  constraint duwams_time_check check (start_time < end_time),
  constraint duwams_status_check check (status in ('active','inactive')),
  constraint duwams_created_by_fk foreign key (created_by) references public.profiles(id)
);

create unique index if not exists duwams_school_branch_name_unique
  on public.duwams(school_id, branch_id, lower(name));
create index if not exists duwams_school_branch_status_idx
  on public.duwams(school_id, branch_id, status);

alter table public.classes
  add column if not exists duwam_id uuid;

alter table public.classes
  drop constraint if exists classes_duwam_scope_fk;
alter table public.classes
  add constraint classes_duwam_scope_fk
  foreign key (school_id, branch_id, duwam_id)
  references public.duwams(school_id, branch_id, id)
  on delete restrict;

create index if not exists classes_duwam_id_idx
  on public.classes(duwam_id) where duwam_id is not null;

alter table public.duwams enable row level security;

drop policy if exists duwams_select_authorized on public.duwams;
create policy duwams_select_authorized on public.duwams
for select to authenticated
using (
  public.has_branch_permission(school_id, branch_id, 'classes.view')
  or public.has_branch_permission(school_id, branch_id, 'classes.manage')
);

drop policy if exists duwams_insert_authorized on public.duwams;
create policy duwams_insert_authorized on public.duwams
for insert to authenticated
with check (
  public.has_branch_permission(school_id, branch_id, 'classes.manage')
  and created_by = auth.uid()
);

drop policy if exists duwams_update_authorized on public.duwams;
create policy duwams_update_authorized on public.duwams
for update to authenticated
using (public.has_branch_permission(school_id, branch_id, 'classes.manage'))
with check (public.has_branch_permission(school_id, branch_id, 'classes.manage'));

grant select, insert, update on public.duwams to authenticated;
revoke all on public.duwams from anon;

comment on table public.duwams is 'Named weekly study schedules that group multiple classes within one branch.';
comment on column public.classes.duwam_id is 'Optional managed duwam container; legacy schedule fields remain for compatibility.';

commit;
