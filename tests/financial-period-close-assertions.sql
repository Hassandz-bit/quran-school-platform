\set ON_ERROR_STOP on

-- School admin starts August close. The two treasury accounts are at their
-- opening balances after prior treasury tests have reversed all business sources.
set role authenticated;
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000001',false);
select public.start_financial_period_closing('10000000-0000-4000-8000-000000000001','2026-08-01') as financial_period_id \gset
select set_config('test.financial_period_id',:'financial_period_id',false);

-- Ordinary back-dating is blocked while closing.
do $$
begin
  begin
    perform public.record_treasury_adjustment(
      '10000000-0000-4000-8000-000000000001',
      (select id from public.list_treasury_link_accounts('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001') where code='CASH_A1'),
      'manual_deposit',10,'2026-08-18','LOCKED-ADJ','يجب أن يمنعها الإغلاق'
    );
    raise exception 'closing period accepted backdated adjustment';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'FINANCIAL_PERIOD_LOCKED' then raise; end if;
  end;
end;
$$;

-- Reconciliation evidence must be dated at the exact period end so the entered
-- cash count / statement date matches the system balance used for close.
do $$
begin
  begin
    perform public.record_treasury_period_reconciliation(
      '10000000-0000-4000-8000-000000000001',current_setting('test.financial_period_id')::uuid,
      (select id from public.list_treasury_link_accounts('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001') where code='CASH_A1'),
      1000,'2026-08-30',null,'تاريخ خاطئ متعمد'
    );
    raise exception 'non-period-end reconciliation date was accepted';
  exception when invalid_parameter_value then
    if sqlerrm <> 'TREASURY_RECONCILIATION_DATE_INVALID' then raise; end if;
  end;
end;
$$;

-- Explicit audited reopen enables correction, then the correction is reversed
-- before closing resumes so the expected cash count remains 1000.
select public.reopen_financial_period('10000000-0000-4000-8000-000000000001',:'financial_period_id','تصحيح مدقق قبل الإقفال النهائي');
select public.record_treasury_adjustment(
  '10000000-0000-4000-8000-000000000001',
  (select id from public.list_treasury_link_accounts('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001') where code='CASH_A1'),
  'manual_deposit',25,'2026-08-18','CORR-001','تصحيح اختبار بعد إعادة الفتح'
) as correction_movement_id \gset
select public.reverse_treasury_adjustment('10000000-0000-4000-8000-000000000001',:'correction_movement_id','إلغاء تصحيح الاختبار');
select public.start_financial_period_closing('10000000-0000-4000-8000-000000000001','2026-08-01');

select public.record_treasury_period_reconciliation(
  '10000000-0000-4000-8000-000000000001',:'financial_period_id',
  (select id from public.list_treasury_link_accounts('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001') where code='CASH_A1'),
  1000,'2026-08-31',null,'عد نقدي مطابق'
);
select public.record_treasury_period_reconciliation(
  '10000000-0000-4000-8000-000000000001',:'financial_period_id',
  (select id from public.list_treasury_link_accounts('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001') where code='BANK_MAIN'),
  5000,'2026-08-31','BANK-STMT-AUG-2026','كشف بنك أغسطس'
);
select public.close_financial_period('10000000-0000-4000-8000-000000000001',:'financial_period_id');

-- Closed month blocks a new August expense through the same column contract used
-- by the browser; created_by is database-owned/defaulted and is not client input.
do $$
begin
  begin
    insert into public.expenses (school_id,branch_id,category,description,amount,expense_date,payment_method)
    values ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','supplies','Blocked closed expense',20,'2026-08-22','cash');
    raise exception 'closed period accepted expense';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'FINANCIAL_PERIOD_LOCKED' then raise; end if;
  end;
end;
$$;

-- A September payment against an August charge is allowed; only the transaction
-- date is locked, and the derived charge status may still refresh after close.
insert into public.payments (school_id,branch_id,student_id,charge_id,amount,payment_method,payment_date,reference_number)
values ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','77000000-0000-4000-8000-000000000001',50,'cash','2026-09-01','LATE-SEP-001')
returning id as late_payment_id \gset
update public.payments set status='reversed' where id=:'late_payment_id';

-- Reconciliation history is append-only. Reopen, create a variance, prove close
-- rejects it, then append a corrected count and close again.
select public.reopen_financial_period('10000000-0000-4000-8000-000000000001',:'financial_period_id','إعادة فتح لاختبار فرق المطابقة');
select public.start_financial_period_closing('10000000-0000-4000-8000-000000000001','2026-08-01');
select public.record_treasury_period_reconciliation(
  '10000000-0000-4000-8000-000000000001',:'financial_period_id',
  (select id from public.list_treasury_link_accounts('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001') where code='CASH_A1'),
  999,'2026-08-31',null,'فرق متعمد لاختبار المنع'
);
do $$
begin
  begin
    perform public.close_financial_period('10000000-0000-4000-8000-000000000001',current_setting('test.financial_period_id')::uuid);
    raise exception 'variance did not block close';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'FINANCIAL_PERIOD_RECONCILIATION_VARIANCE' then raise; end if;
  end;
end;
$$;
select public.reopen_financial_period('10000000-0000-4000-8000-000000000001',:'financial_period_id','تصحيح فرق المطابقة قبل الإقفال');
select public.start_financial_period_closing('10000000-0000-4000-8000-000000000001','2026-08-01');
select public.record_treasury_period_reconciliation(
  '10000000-0000-4000-8000-000000000001',:'financial_period_id',
  (select id from public.list_treasury_link_accounts('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001') where code='CASH_A1'),
  1000,'2026-08-31',null,'العد المصحح النهائي'
);
select public.close_financial_period('10000000-0000-4000-8000-000000000001',:'financial_period_id');

-- Browser cannot overwrite a prior reconciliation row.
do $$
begin
  begin
    update public.treasury_account_reconciliations set notes='tamper';
    raise exception 'reconciliation history was mutable';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Formal statement is derived from rows and remains available after close.
select public.get_financial_statement('10000000-0000-4000-8000-000000000001','2026-08-01',null) as statement \gset
select set_config('test.statement',:'statement',false);
do $$
declare p jsonb:=current_setting('test.statement')::jsonb; method_count integer;
begin
  if p->>'period_status' <> 'closed' then raise exception 'statement did not report closed period: %',p; end if;
  if (p->'cash'->>'closing_balance')::numeric <> 6000 then raise exception 'treasury closing balance should be 6000: %',p->'cash'; end if;
  if (p->'cash'->>'opening_balance_entries')::numeric <> 6000 then raise exception 'opening balance entries should be 6000: %',p->'cash'; end if;
  if jsonb_array_length(p->'accounts') <> 2 then raise exception 'statement account breakdown missing: %',p->'accounts'; end if;
  if (p->'payroll'->>'unpaid_at_end')::numeric < 0 then raise exception 'invalid unpaid payroll'; end if;
  select count(*) into method_count from public.list_financial_statement_payment_methods('10000000-0000-4000-8000-000000000001','2026-08-01',null);
  if method_count < 0 then raise exception 'invalid payment-method breakdown count'; end if;
end;
$$;

-- Cross-tenant reads and payment-method breakdowns are rejected.
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000008',false);
do $$
begin
  begin
    perform public.get_financial_statement('10000000-0000-4000-8000-000000000001','2026-08-01',null);
    raise exception 'cross-tenant statement read succeeded';
  exception when insufficient_privilege then
    if sqlerrm <> 'FINANCIAL_STATEMENT_VIEW_REQUIRED' then raise; end if;
  end;
  begin
    perform 1 from public.list_financial_statement_payment_methods('10000000-0000-4000-8000-000000000001','2026-08-01',null);
    raise exception 'cross-tenant payment-method breakdown succeeded';
  exception when insufficient_privilege then
    if sqlerrm <> 'FINANCIAL_STATEMENT_VIEW_REQUIRED' then raise; end if;
  end;
end;
$$;

reset role;
do $$
declare rec_count integer; event_count integer; bad_evidence_dates integer;
begin
  select count(*) into rec_count from public.treasury_account_reconciliations where period_id=current_setting('test.financial_period_id')::uuid;
  if rec_count < 4 then raise exception 'reconciliation attempts were overwritten, count=%',rec_count; end if;
  select count(*) into bad_evidence_dates from public.treasury_account_reconciliations
  where period_id=current_setting('test.financial_period_id')::uuid and evidence_date <> '2026-08-31';
  if bad_evidence_dates <> 0 then raise exception 'reconciliation evidence date was not retained correctly'; end if;
  select count(*) into event_count from public.financial_period_events where period_id=current_setting('test.financial_period_id')::uuid and action='reopen';
  if event_count < 3 then raise exception 'reopen audit trail incomplete, count=%',event_count; end if;
end;
$$;

select 'financial_period_close_runtime_passed' as result;
