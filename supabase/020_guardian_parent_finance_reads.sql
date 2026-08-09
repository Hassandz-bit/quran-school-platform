-- Quran School SaaS - parent finance read RPCs
-- Guardian / Parent Portal PR D only. Read-only finance access to the guardian's
-- own active children. No finance permissions and no core finance RLS widening.

begin;

create or replace function public.get_my_guardian_student_finance_summary(
  target_school_id uuid,
  target_student_id uuid
)
returns table (
  total_charged numeric,
  total_paid numeric,
  remaining_amount numeric,
  overdue_amount numeric,
  open_charges_count bigint,
  last_payment_date date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if target_school_id is null
    or target_student_id is null
    or not public.is_active_guardian_of_student(
      target_school_id,
      target_student_id
    )
  then
    raise exception using errcode = '42501', message = 'student access denied';
  end if;

  return query
  with charge_balances as (
    select
      charge.id,
      charge.net_amount,
      charge.due_date,
      charge.status,
      coalesce(
        sum(payment.amount) filter (where payment.status = 'completed'),
        0
      )::numeric as paid_amount
    from public.student_charges as charge
    left join public.payments as payment
      on payment.school_id = charge.school_id
     and payment.branch_id = charge.branch_id
     and payment.student_id = charge.student_id
     and payment.charge_id = charge.id
    where charge.school_id = target_school_id
      and charge.student_id = target_student_id
    group by
      charge.id,
      charge.net_amount,
      charge.due_date,
      charge.status
  )
  select
    coalesce(
      sum(balance.net_amount)
        filter (where balance.status not in ('waived', 'cancelled')),
      0
    )::numeric,
    coalesce(
      sum(balance.paid_amount)
        filter (where balance.status not in ('waived', 'cancelled')),
      0
    )::numeric,
    coalesce(
      sum(greatest(balance.net_amount - balance.paid_amount, 0))
        filter (where balance.status not in ('waived', 'cancelled')),
      0
    )::numeric,
    coalesce(
      sum(greatest(balance.net_amount - balance.paid_amount, 0))
        filter (
          where balance.status not in ('waived', 'cancelled')
            and balance.due_date < current_date
            and greatest(balance.net_amount - balance.paid_amount, 0) > 0
        ),
      0
    )::numeric,
    count(*) filter (
      where balance.status not in ('waived', 'cancelled')
        and greatest(balance.net_amount - balance.paid_amount, 0) > 0
    )::bigint,
    (
      select max(payment.payment_date)
      from public.payments as payment
      where payment.school_id = target_school_id
        and payment.student_id = target_student_id
        and payment.status = 'completed'
    )
  from charge_balances as balance;
end;
$$;

comment on function public.get_my_guardian_student_finance_summary(uuid, uuid) is
  'Returns aggregate billable charges and completed payments only for a student with an active guardian relationship. Waived and cancelled charges are excluded from totals.';

create or replace function public.list_my_guardian_student_charges(
  target_school_id uuid,
  target_student_id uuid,
  target_limit integer default 30
)
returns table (
  charge_id uuid,
  charge_type text,
  description text,
  original_amount numeric,
  discount_amount numeric,
  net_amount numeric,
  due_date date,
  charge_status text,
  paid_amount numeric,
  remaining_amount numeric,
  is_overdue boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if target_limit is null or target_limit < 1 or target_limit > 100 then
    raise exception using errcode = '22023', message = 'invalid charge limit';
  end if;

  if target_school_id is null
    or target_student_id is null
    or not public.is_active_guardian_of_student(
      target_school_id,
      target_student_id
    )
  then
    raise exception using errcode = '42501', message = 'student access denied';
  end if;

  return query
  select
    charge.id,
    charge.charge_type,
    charge.description,
    charge.original_amount,
    charge.discount_amount,
    charge.net_amount,
    charge.due_date,
    charge.status,
    coalesce(payment_totals.paid_amount, 0)::numeric,
    case
      when charge.status in ('waived', 'cancelled') then 0::numeric
      else greatest(
        charge.net_amount - coalesce(payment_totals.paid_amount, 0),
        0
      )::numeric
    end,
    charge.status not in ('waived', 'cancelled')
      and charge.due_date < current_date
      and greatest(
        charge.net_amount - coalesce(payment_totals.paid_amount, 0),
        0
      ) > 0
  from public.student_charges as charge
  left join lateral (
    select coalesce(sum(payment.amount), 0)::numeric as paid_amount
    from public.payments as payment
    where payment.school_id = charge.school_id
      and payment.branch_id = charge.branch_id
      and payment.student_id = charge.student_id
      and payment.charge_id = charge.id
      and payment.status = 'completed'
  ) as payment_totals on true
  where charge.school_id = target_school_id
    and charge.student_id = target_student_id
  order by charge.due_date desc, charge.created_at desc, charge.id desc
  limit target_limit;
end;
$$;

comment on function public.list_my_guardian_student_charges(uuid, uuid, integer) is
  'Returns bounded charge details and computed balances for the caller active guardian student only. Internal actor fields are intentionally omitted.';

create or replace function public.list_my_guardian_student_payments(
  target_school_id uuid,
  target_student_id uuid,
  target_limit integer default 30
)
returns table (
  payment_id uuid,
  charge_id uuid,
  charge_description text,
  amount numeric,
  payment_method text,
  payment_date date,
  payment_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if target_limit is null or target_limit < 1 or target_limit > 100 then
    raise exception using errcode = '22023', message = 'invalid payment limit';
  end if;

  if target_school_id is null
    or target_student_id is null
    or not public.is_active_guardian_of_student(
      target_school_id,
      target_student_id
    )
  then
    raise exception using errcode = '42501', message = 'student access denied';
  end if;

  return query
  select
    payment.id,
    payment.charge_id,
    charge.description,
    payment.amount,
    payment.payment_method,
    payment.payment_date,
    payment.status
  from public.payments as payment
  join public.student_charges as charge
    on charge.school_id = payment.school_id
   and charge.branch_id = payment.branch_id
   and charge.student_id = payment.student_id
   and charge.id = payment.charge_id
  where payment.school_id = target_school_id
    and payment.student_id = target_student_id
  order by payment.payment_date desc, payment.created_at desc, payment.id desc
  limit target_limit;
end;
$$;

comment on function public.list_my_guardian_student_payments(uuid, uuid, integer) is
  'Returns bounded payment history for the caller active guardian student only. Notes, receiver identity, and internal accounting metadata are omitted.';

revoke all on function public.get_my_guardian_student_finance_summary(uuid, uuid)
from public, anon;
grant execute on function public.get_my_guardian_student_finance_summary(uuid, uuid)
to authenticated;

revoke all on function public.list_my_guardian_student_charges(uuid, uuid, integer)
from public, anon;
grant execute on function public.list_my_guardian_student_charges(uuid, uuid, integer)
to authenticated;

revoke all on function public.list_my_guardian_student_payments(uuid, uuid, integer)
from public, anon;
grant execute on function public.list_my_guardian_student_payments(uuid, uuid, integer)
to authenticated;

commit;
