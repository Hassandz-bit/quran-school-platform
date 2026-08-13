-- Quran School SaaS - internal financial helper execution lockdown
-- Internal SECURITY DEFINER helpers are callable only by their owning RPC/trigger paths.

begin;

do $$
declare
  target_function record;
begin
  for target_function in
    select procedure.oid::regprocedure as signature
    from pg_proc as procedure
    join pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prosecdef
      and procedure.proname = any (array[
        'finance_can_manage_generation_scope',
        'financial_guard_dated_row',
        'financial_guard_manual_treasury_movement',
        'financial_guard_payroll_entry',
        'financial_guard_student_charge',
        'financial_period_account_balance_as_of',
        'financial_period_assert_date_open',
        'financial_statement_row_visible',
        'payroll_can_manage_scope',
        'payroll_can_view_scope',
        'sync_expense_treasury_movement',
        'sync_other_income_treasury_movement',
        'sync_payment_treasury_movement',
        'sync_payroll_payment_treasury_movement',
        'sync_treasury_business_movement',
        'treasury_account_balance_internal',
        'treasury_can_manage_account',
        'treasury_can_view_account',
        'treasury_source_scope_can_manage',
        'treasury_source_scope_can_view',
        'validate_expense_treasury_link',
        'validate_other_income_treasury_link',
        'validate_payment_treasury_link',
        'validate_payroll_compensation_profile',
        'validate_payroll_payment_treasury_link',
        'validate_treasury_account_for_transaction'
      ]::text[])
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      target_function.signature
    );
  end loop;
end;
$$;

commit;
