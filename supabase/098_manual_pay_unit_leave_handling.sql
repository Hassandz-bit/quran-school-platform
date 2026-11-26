-- QuranOS: manual compensation is an administrator-entered amount, not a scheduled monthly rate.
-- Monthly compensation remains prorated; manual amounts are never auto-deducted for leave.
begin;

do $migration$
declare
  function_definition text;
  old_deduction text := $old$case when profile.pay_unit in ('month','manual') and leave_adjustment.unpaid_leave_units>0
      then profile.base_amount * (leave_adjustment.unpaid_leave_units/nullif(leave_adjustment.scheduled_units,0))
      else 0::numeric end$old$;
  new_deduction text := $new$case when profile.pay_unit = 'month' and leave_adjustment.unpaid_leave_units>0
      then profile.base_amount * (leave_adjustment.unpaid_leave_units/nullif(leave_adjustment.scheduled_units,0))
      else 0::numeric end$new$;
  old_factor text := $old$case
        when profile.pay_unit in ('month','manual') and leave_adjustment.unpaid_leave_units>0
          then greatest(0::numeric,1-(leave_adjustment.unpaid_leave_units/nullif(leave_adjustment.scheduled_units,0)))
        else 1::numeric
      end as amount_factor$old$;
  new_factor text := $new$case
        when profile.pay_unit = 'month' and leave_adjustment.unpaid_leave_units>0
          then greatest(0::numeric,1-(leave_adjustment.unpaid_leave_units/nullif(leave_adjustment.scheduled_units,0)))
        else 1::numeric
      end as amount_factor$new$;
  old_schedule_guard text := $old$and adjustment.scheduled_units=0$old$;
  new_schedule_guard text := $new$and adjustment.scheduled_units=0
      and profile.pay_unit <> 'manual'$new$;
begin
  function_definition := pg_get_functiondef(
    'public.generate_payroll_period(uuid,uuid,date,text)'::regprocedure
  );

  if position(old_deduction in function_definition)=0
    or position(old_factor in function_definition)=0
    or position(old_schedule_guard in function_definition)=0 then
    raise exception 'Expected payroll function fragments were not found; migration aborted safely';
  end if;

  function_definition := replace(function_definition,old_deduction,new_deduction);
  function_definition := replace(function_definition,old_factor,new_factor);
  function_definition := replace(function_definition,old_schedule_guard,new_schedule_guard);

  execute function_definition;
end;
$migration$;

commit;
