-- QuranOS V2 - treasury bootstrap authorization hardening
-- Lets an authorized finance user open an empty treasury before the first account exists.

begin;

create or replace function public.get_treasury_bootstrap(target_school_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  has_scope boolean;
  result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'TREASURY_AUTH_REQUIRED';
  end if;
  if not public.is_active_school_member(target_school_id) then
    raise exception using errcode = '42501', message = 'TREASURY_VIEW_REQUIRED';
  end if;

  has_scope :=
    public.has_school_permission(target_school_id, 'finance.view')
    or public.has_school_permission(target_school_id, 'finance.manage')
    or exists (
      select 1
      from public.branches b
      where b.school_id = target_school_id
        and (
          public.has_branch_permission(target_school_id, b.id, 'finance.view')
          or public.has_branch_permission(target_school_id, b.id, 'finance.manage')
        )
    );
  if not has_scope then
    raise exception using errcode = '42501', message = 'TREASURY_VIEW_REQUIRED';
  end if;

  select jsonb_build_object(
    'can_manage_school', public.has_school_permission(target_school_id, 'finance.manage'),
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'name', b.name,
        'is_main', b.is_main,
        'can_manage', public.has_school_permission(target_school_id, 'finance.manage')
          or public.has_branch_permission(target_school_id, b.id, 'finance.manage')
      ) order by b.is_main desc, b.name)
      from public.branches b
      where b.school_id = target_school_id
        and b.status = 'active'
        and (
          public.has_school_permission(target_school_id, 'finance.view')
          or public.has_school_permission(target_school_id, 'finance.manage')
          or public.has_branch_permission(target_school_id, b.id, 'finance.view')
          or public.has_branch_permission(target_school_id, b.id, 'finance.manage')
        )
    ), '[]'::jsonb),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'branch_id', a.branch_id,
        'account_type', a.account_type,
        'name', a.name,
        'code', a.code,
        'account_reference', a.account_reference,
        'currency', a.currency,
        'status', a.status,
        'balance', public.treasury_account_balance_internal(a.school_id, a.id),
        'can_manage', public.treasury_can_manage_account(a.school_id, a.branch_id)
      ) order by a.branch_id nulls first, a.name)
      from public.treasury_accounts a
      where a.school_id = target_school_id
        and public.treasury_can_view_account(a.school_id, a.branch_id)
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_treasury_bootstrap(uuid) from public, anon;
grant execute on function public.get_treasury_bootstrap(uuid) to authenticated;

comment on function public.get_treasury_bootstrap(uuid) is
  'Finance-scoped treasury bootstrap authorized by school/branch permissions, usable even before the first treasury account exists.';

commit;