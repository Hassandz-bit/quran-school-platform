\set ON_ERROR_STOP on

do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.create_school_demo_data(uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated_role_can_still_create_demo_data';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.get_school_demo_status(uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated_role_can_still_read_demo_status';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.clear_school_demo_data(uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated_role_cannot_use_protected_legacy_cleanup';
  end if;

  if to_regclass('public.demo_seed_batches') is null
     or to_regclass('public.demo_seed_records') is null then
    raise exception 'legacy_demo_tracking_tables_were_removed';
  end if;

  if not exists (
    select 1
    from public.demo_seed_batches as batch
    join public.demo_seed_records as seed_record
      on seed_record.batch_id = batch.id
     and seed_record.school_id = batch.school_id
    join public.students as student
      on student.id = seed_record.record_id
     and student.school_id = seed_record.school_id
    where batch.school_id = '10000000-0000-4000-8000-000000000001'
      and batch.status = 'active'
      and seed_record.entity_type = 'student'
  ) then
    raise exception 'retirement_migration_removed_existing_demo_records';
  end if;
end;
$$;
