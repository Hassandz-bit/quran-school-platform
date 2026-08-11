-- Quran School SaaS - payroll hardening and history
-- V2 review migration only. Do not apply to Production manually.
-- Prevents overlapping staff compensation across scopes and exposes bounded RPC-only history.

begin;

drop index if exists public.payroll_comp_member_effective_from_unique_idx;
create unique index payroll_comp_member_effective_from_unique_idx
  on public.payroll_compensation_profiles (school_id, membership_id, effective_from)
  where membership_id is not null;

create or replace function public.validate_payroll_compensation_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  teacher_branch uuid;
begin
  if new.payee_kind = 'teacher' then
    select t.branch_id into teacher_branch
    from public.teachers t
    where t.school_id = new.school_id
      and t.id = new.teacher_id
      and t.status <> 'archived';
    if not found then
      raise exception using errcode = '23514', message = 'PAYROLL_TEACHER_UNAVAILABLE';
    end if;
    if new.branch_id is null or new.branch_id <> teacher_branch then
      raise exception using errcode = '23514', message = 'PAYROLL_TEACHER_BRANCH_MISMATCH';
    end if;
  else
    if not exists (
      select 1
      from public.school_memberships sm
      where sm.school_id = new.school_id
        and sm.id = new.membership_id
        and sm.status = 'active'
    ) then
      raise exception using errcode = '23514', message = 'PAYROLL_MEMBER_UNAVAILABLE';
    end if;

    if new.branch_id is null then
      if not exists (
        select 1
        from public.membership_roles mr
        join public.roles r
          on r.school_id = mr.school_id
         and r.id = mr.role_id
         and r.status = 'active'
        where mr.school_id = new.school_id
          and mr.membership_id = new.membership_id
          and mr.branch_id is null
      ) then
        raise exception using errcode = '23514', message = 'PAYROLL_MEMBER_SCHOOL_SCOPE_REQUIRED';
      end if;
    else
      if not exists (
        select 1
        from public.membership_roles mr
        join public.roles r
          on r.school_id = mr.school_id
         and r.id = mr.role_id
         and r.status = 'active'
        where mr.school_id = new.school_id
          and mr.membership_id = new.membership_id
          and (mr.branch_id is null or mr.branch_id = new.branch_id)
      ) then
        raise exception using errcode = '23514', message = 'PAYROLL_MEMBER_BRANCH_SCOPE_REQUIRED';
      end if;
    end if;

    if exists (
      select 1
      from public.teachers t
      join public.school_memberships sm
        on sm.school_id = t.school_id
       and sm.profile_id = t.profile_id
      where t.school_id = new.school_id
        and sm.id = new.membership_id
        and t.status <> 'archived'
    ) then
      raise exception using errcode = '23514', message = 'PAYROLL_LINKED_TEACHER_USE_TEACHER_PAYEE';
    end if;
  end if;

  if exists (
    select 1
    from public.payroll_compensation_profiles p
    where p.school_id = new.school_id
      and p.id <> new.id
      and p.payee_kind = new.payee_kind
      and (
        (new.payee_kind = 'teacher' and p.teacher_id = new.teacher_id)
        or (new.payee_kind = 'member' and p.membership_id = new.membership_id)
      )
      and daterange(
        p.effective_from,
        coalesce(p.effective_to, 'infinity'::date),
        '[]'
      ) && daterange(
        new.effective_from,
        coalesce(new.effective_to, 'infinity'::date),
        '[]'
      )
  ) then
    raise exception using errcode = '23514', message = 'PAYROLL_COMPENSATION_PERIOD_OVERLAP';
  end if;

  return new;
end;
$$;

create or replace function public.list_payroll_history(
  target_school_id uuid,
  target_branch_id uuid default null,
  target_payee_kind text default null,
  target_payee_id uuid default null,
  target_limit integer default 100
)
returns table (
  entry_id uuid,
  branch_id uuid,
  period_month date,
  payee_kind text,
  teacher_id uuid,
  membership_id uuid,
  payee_name text,
  role_label text,
  base_amount numeric,
  additions numeric,
  deductions numeric,
  advances numeric,
  net_amount numeric,
  entry_status text,
  payment_id uuid,
  payment_amount numeric,
  payment_method text,
  payment_date date,
  payment_status text,
  payment_reference text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'PAYROLL_AUTH_REQUIRED';
  end if;
  if not public.payroll_can_view_scope(target_school_id, target_branch_id) then
    raise exception using errcode = '42501', message = 'PAYROLL_VIEW_REQUIRED';
  end if;
  if target_limit is null or target_limit not between 1 and 500 then
    raise exception using errcode = '22023', message = 'PAYROLL_HISTORY_LIMIT_INVALID';
  end if;
  if target_payee_kind is not null and target_payee_kind not in ('teacher', 'member') then
    raise exception using errcode = '22023', message = 'PAYROLL_HISTORY_PAYEE_INVALID';
  end if;
  if (target_payee_kind is null) <> (target_payee_id is null) then
    raise exception using errcode = '22023', message = 'PAYROLL_HISTORY_PAYEE_INVALID';
  end if;

  return query
  select
    e.id,
    e.branch_id,
    p.period_month,
    e.payee_kind,
    e.teacher_id,
    e.membership_id,
    e.payee_name_snapshot,
    e.payee_role_snapshot,
    e.base_amount,
    e.additions,
    e.deductions,
    e.advances,
    e.net_amount,
    e.status,
    pay.id,
    pay.amount,
    pay.payment_method,
    pay.payment_date,
    pay.status,
    pay.reference_number
  from public.payroll_entries e
  join public.payroll_periods p
    on p.school_id = e.school_id
   and p.id = e.period_id
  left join lateral (
    select pp.*
    from public.payroll_payments pp
    where pp.school_id = e.school_id
      and pp.payroll_entry_id = e.id
    order by pp.created_at desc, pp.id desc
    limit 1
  ) pay on true
  where e.school_id = target_school_id
    and e.branch_id is not distinct from target_branch_id
    and (
      target_payee_kind is null
      or (target_payee_kind = 'teacher' and e.teacher_id = target_payee_id)
      or (target_payee_kind = 'member' and e.membership_id = target_payee_id)
    )
  order by p.period_month desc, e.payee_name_snapshot, e.id
  limit target_limit;
end;
$$;

revoke all on function public.validate_payroll_compensation_profile() from public;
revoke all on function public.list_payroll_history(uuid, uuid, text, uuid, integer) from public;
revoke execute on function public.list_payroll_history(uuid, uuid, text, uuid, integer) from anon;
grant execute on function public.list_payroll_history(uuid, uuid, text, uuid, integer) to authenticated;

comment on function public.list_payroll_history(uuid, uuid, text, uuid, integer) is
  'Bounded payroll history scoped by existing finance view/manage permissions. Includes latest completed or reversed payment evidence and never grants payees implicit access.';

commit;
