-- Enforce teacher-only memorization writes at the database boundary.
-- School admins and branch managers retain view access but cannot create or edit records.
begin;
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
      select 1 from public.classes as target_class
      where target_class.school_id = target_school_id
        and target_class.branch_id = target_branch_id
        and target_class.id = target_class_id
        and target_class.status = 'active'
    )
    and (
      (
        target_permission_code = 'memorization.view'
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
            and permission.code = 'memorization.view'
            and (membership_role.branch_id is null or membership_role.branch_id = target_branch_id)
            and (
              role.code <> 'teacher'
              or exists (
                select 1
                from public.teachers as assigned_teacher
                join public.class_teachers as assigned_class_teacher
                  on assigned_class_teacher.school_id = assigned_teacher.school_id
                 and assigned_class_teacher.branch_id = assigned_teacher.branch_id
                 and assigned_class_teacher.teacher_id = assigned_teacher.id
                 and assigned_class_teacher.status = 'active'
                where assigned_teacher.school_id = target_school_id
                  and assigned_teacher.branch_id = target_branch_id
                  and assigned_teacher.profile_id = (select auth.uid())
                  and assigned_teacher.status = 'active'
                  and assigned_class_teacher.class_id = target_class_id
              )
            )
        )
      )
      or
      (
        target_permission_code = 'memorization.manage'
        and exists (
          select 1
          from public.school_memberships as membership
          join public.membership_roles as membership_role
            on membership_role.school_id = membership.school_id
           and membership_role.membership_id = membership.id
          join public.roles as role
            on role.school_id = membership_role.school_id
           and role.id = membership_role.role_id
           and role.code = 'teacher'
           and role.status = 'active'
          join public.role_permissions as role_permission
            on role_permission.school_id = role.school_id
           and role_permission.role_id = role.id
          join public.permissions as permission
            on permission.id = role_permission.permission_id
          where membership.school_id = target_school_id
            and membership.profile_id = (select auth.uid())
            and membership.status = 'active'
            and permission.code = 'memorization.manage'
            and (membership_role.branch_id is null or membership_role.branch_id = target_branch_id)
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
revoke all on function public.can_access_memorization_class(uuid, uuid, uuid, text) from public;
revoke execute on function public.can_access_memorization_class(uuid, uuid, uuid, text) from anon;
grant execute on function public.can_access_memorization_class(uuid, uuid, uuid, text) to authenticated;
create or replace function public.prepare_memorization_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_school_id uuid;
  resolved_branch_id uuid;
  resolved_teacher_profile_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = '42501',
      message = 'MEMORIZATION_AUTH_REQUIRED';
  end if;

  if tg_op = 'INSERT' then
    select target_class.school_id, target_class.branch_id
      into strict resolved_school_id, resolved_branch_id
    from public.classes as target_class
    where target_class.id = new.class_id
      and target_class.status = 'active';

    if not exists (
      select 1
      from public.students as student
      where student.id = new.student_id
        and student.school_id = resolved_school_id
        and student.branch_id = resolved_branch_id
        and student.class_id = new.class_id
        and student.status = 'active'
    ) then
      raise exception using
        errcode = '23514',
        message = 'MEMORIZATION_STUDENT_NOT_IN_ACTIVE_CLASS';
    end if;

    select teacher.profile_id
      into resolved_teacher_profile_id
    from public.teachers as teacher
    join public.class_teachers as class_teacher
      on class_teacher.school_id = teacher.school_id
     and class_teacher.branch_id = teacher.branch_id
     and class_teacher.teacher_id = teacher.id
     and class_teacher.class_id = new.class_id
     and class_teacher.status = 'active'
    where teacher.id = new.teacher_id
      and teacher.school_id = resolved_school_id
      and teacher.branch_id = resolved_branch_id
      and teacher.status = 'active';

    if not found then
      raise exception using
        errcode = '23514',
        message = 'MEMORIZATION_TEACHER_NOT_ASSIGNED_TO_CLASS';
    end if;

    if resolved_teacher_profile_id is distinct from (select auth.uid()) then
      raise exception using
        errcode = '42501',
        message = 'MEMORIZATION_TEACHER_IDENTITY_MISMATCH';
    end if;

    new.school_id := resolved_school_id;
    new.branch_id := resolved_branch_id;
    new.recorded_by := (select auth.uid());
    new.last_modified_by := (select auth.uid());
  else
    if new.school_id is distinct from old.school_id
      or new.branch_id is distinct from old.branch_id
      or new.class_id is distinct from old.class_id
      or new.student_id is distinct from old.student_id
      or new.teacher_id is distinct from old.teacher_id
      or new.recorded_by is distinct from old.recorded_by
    then
      raise exception using
        errcode = '23514',
        message = 'MEMORIZATION_IDENTITY_FIELDS_IMMUTABLE';
    end if;

    select teacher.profile_id
      into resolved_teacher_profile_id
    from public.teachers as teacher
    where teacher.id = old.teacher_id
      and teacher.school_id = old.school_id
      and teacher.branch_id = old.branch_id
      and teacher.status = 'active';

    if resolved_teacher_profile_id is distinct from (select auth.uid()) then
      raise exception using
        errcode = '42501',
        message = 'MEMORIZATION_TEACHER_UPDATE_FORBIDDEN';
    end if;

    new.last_modified_by := (select auth.uid());
  end if;

  return new;
exception
  when no_data_found then
    raise exception using
      errcode = '23503',
      message = 'MEMORIZATION_ACTIVE_CLASS_NOT_FOUND';
end;
$$;
commit;
