-- School-track assessment results with branch/class authorization and append-only audit history.
begin;

-- The composite key keeps every result tied to the student's actual tenant and branch.
create unique index if not exists students_school_branch_id_unique_idx
  on public.students (school_id, branch_id, id);

insert into public.permissions (code, module, name_ar, description)
values
  (
    'school_track.view',
    'school_track',
    'عرض المسار المدرسي',
    'عرض نتائج الامتحانات والتقارير المدرسية ضمن الفرع أو الحلقة المصرح بها'
  ),
  (
    'school_track.manage',
    'school_track',
    'إدارة المسار المدرسي',
    'تسجيل نتائج الامتحانات وتصحيحها ضمن الفرع أو الحلقة المصرح بها'
  )
on conflict (code) do update
set module = excluded.module,
    name_ar = excluded.name_ar,
    description = excluded.description;

with grants (role_code, permission_code) as (
  values
    ('school_admin', 'school_track.view'),
    ('school_admin', 'school_track.manage'),
    ('branch_manager', 'school_track.view'),
    ('branch_manager', 'school_track.manage'),
    ('academic_supervisor', 'school_track.view'),
    ('academic_supervisor', 'school_track.manage'),
    ('teacher', 'school_track.view'),
    ('teacher', 'school_track.manage'),
    ('registrar', 'school_track.view'),
    ('registrar', 'school_track.manage')
)
insert into public.role_permissions (school_id, role_id, permission_id)
select role.school_id, role.id, permission.id
from grants as role_grant
join public.roles as role
  on role.code = role_grant.role_code
join public.permissions as permission
  on permission.code = role_grant.permission_code
on conflict (role_id, permission_id) do nothing;

create table public.school_track_results (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  branch_id uuid not null,
  class_id uuid,
  student_id uuid not null,
  subject text not null,
  assessment_title text not null,
  assessment_type text not null default 'exam',
  academic_year text not null,
  term text not null,
  assessment_date date not null,
  score numeric(7,2) not null,
  max_score numeric(7,2) not null default 20,
  notes text,
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_track_results_student_scope_fk
    foreign key (school_id, branch_id, student_id)
    references public.students (school_id, branch_id, id),
  constraint school_track_results_class_scope_fk
    foreign key (school_id, branch_id, class_id)
    references public.classes (school_id, branch_id, id),
  constraint school_track_results_created_by_fk
    foreign key (created_by) references public.profiles(id),
  constraint school_track_results_updated_by_fk
    foreign key (updated_by) references public.profiles(id),
  constraint school_track_results_subject_check
    check (char_length(btrim(subject)) between 1 and 100),
  constraint school_track_results_title_check
    check (char_length(btrim(assessment_title)) between 1 and 120),
  constraint school_track_results_type_check
    check (assessment_type in ('quiz', 'test', 'exam', 'oral', 'continuous', 'other')),
  constraint school_track_results_year_check
    check (academic_year ~ '^[0-9]{4}[-/][0-9]{4}$'),
  constraint school_track_results_term_check
    check (char_length(btrim(term)) between 1 and 60),
  constraint school_track_results_score_check
    check (score >= 0 and max_score > 0 and max_score <= 1000 and score <= max_score),
  constraint school_track_results_notes_check
    check (notes is null or char_length(notes) <= 2000)
);

comment on table public.school_track_results is
  'Per-student school examinations and evaluations; Quran memorization data remains in its existing module.';
comment on column public.school_track_results.class_id is
  'Quran-school class snapshot at the time of the assessment, used to scope teacher access.';
comment on column public.school_track_results.max_score is
  'Configurable maximum score for this assessment; the UI defaults to 20 but does not enforce one grading scale.';

create index school_track_results_student_date_idx
  on public.school_track_results (school_id, branch_id, student_id, assessment_date desc);
create index school_track_results_report_idx
  on public.school_track_results (school_id, branch_id, academic_year, term, subject, assessment_date desc);
create index school_track_results_class_date_idx
  on public.school_track_results (school_id, branch_id, class_id, assessment_date desc);

create or replace function public.can_access_school_track_class(
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
    target_permission_code in ('school_track.view', 'school_track.manage')
    and public.is_active_school_member(target_school_id)
    and exists (
      select 1
      from public.branches as target_branch
      where target_branch.school_id = target_school_id
        and target_branch.id = target_branch_id
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
        target_class_id is not null
        and exists (
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

revoke all on function public.can_access_school_track_class(uuid, uuid, uuid, text)
  from public, anon;
grant execute on function public.can_access_school_track_class(uuid, uuid, uuid, text)
  to authenticated;

create table public.school_track_result_history (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  branch_id uuid not null,
  class_id uuid,
  result_id uuid not null references public.school_track_results(id) on delete restrict,
  operation text not null check (operation in ('insert', 'update')),
  old_values jsonb,
  new_values jsonb not null,
  changed_by uuid not null default auth.uid(),
  changed_at timestamptz not null default now(),
  constraint school_track_result_history_actor_fk
    foreign key (changed_by) references public.profiles(id)
);
create index school_track_result_history_result_idx
  on public.school_track_result_history (school_id, result_id, changed_at desc);

create or replace function public.set_school_track_result_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

create or replace function public.audit_school_track_result()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.school_track_result_history (
      school_id, branch_id, class_id, result_id, operation, old_values, new_values, changed_by
    ) values (
      new.school_id, new.branch_id, new.class_id, new.id, 'insert', null,
      to_jsonb(new), (select auth.uid())
    );
  else
    insert into public.school_track_result_history (
      school_id, branch_id, class_id, result_id, operation, old_values, new_values, changed_by
    ) values (
      new.school_id, new.branch_id, new.class_id, new.id, 'update', to_jsonb(old),
      to_jsonb(new), (select auth.uid())
    );
  end if;
  return new;
end;
$$;

revoke all on function public.set_school_track_result_updated_at() from public, anon;
revoke all on function public.audit_school_track_result() from public, anon;

create trigger school_track_results_set_updated_at
before update on public.school_track_results
for each row execute function public.set_school_track_result_updated_at();
create trigger school_track_results_audit
 after insert or update on public.school_track_results
for each row execute function public.audit_school_track_result();

alter table public.school_track_results enable row level security;
alter table public.school_track_result_history enable row level security;

revoke all on public.school_track_results,
  public.school_track_result_history
from public, anon, authenticated;

grant select on public.school_track_results to authenticated;
grant insert (
  school_id, branch_id, class_id, student_id, subject, assessment_title,
  assessment_type, academic_year, term, assessment_date, score, max_score, notes
) on public.school_track_results to authenticated;
grant update (
  subject, assessment_title, assessment_type, academic_year, term,
  assessment_date, score, max_score, notes
) on public.school_track_results to authenticated;
grant select on public.school_track_result_history to authenticated;

create policy school_track_results_select_authorized
on public.school_track_results
for select to authenticated
using (
  public.can_access_school_track_class(
    school_id, branch_id, class_id, 'school_track.view'
  )
  or public.can_access_school_track_class(
    school_id, branch_id, class_id, 'school_track.manage'
  )
);

create policy school_track_results_insert_authorized
on public.school_track_results
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and public.can_access_school_track_class(
    school_id, branch_id, class_id, 'school_track.manage'
  )
);

create policy school_track_results_update_authorized
on public.school_track_results
for update to authenticated
using (
  public.can_access_school_track_class(
    school_id, branch_id, class_id, 'school_track.manage'
  )
)
with check (
  updated_by = (select auth.uid())
  and public.can_access_school_track_class(
    school_id, branch_id, class_id, 'school_track.manage'
  )
);

create policy school_track_history_select_managers
on public.school_track_result_history
for select to authenticated
using (
  public.can_access_school_track_class(
    school_id, branch_id, class_id, 'school_track.manage'
  )
);

-- Assessment rows are corrected through audited UPDATE operations. No browser
-- DELETE or history-write privileges are granted.
commit;
