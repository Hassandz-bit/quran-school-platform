\set ON_ERROR_STOP on

create temp table demo_baseline as
select
  (select count(*) from public.students where school_id = '10000000-0000-4000-8000-000000000001') as students,
  (select count(*) from public.teachers where school_id = '10000000-0000-4000-8000-000000000001') as teachers,
  (select count(*) from public.classes where school_id = '10000000-0000-4000-8000-000000000001') as classes;

-- Non-admin staff cannot create demo data.
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000003', false);
do $$
begin
  begin
    perform public.create_school_demo_data('10000000-0000-4000-8000-000000000001');
    raise exception 'teacher unexpectedly created demo data';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

-- School admin creates one coherent demo batch.
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', false);
select public.create_school_demo_data('10000000-0000-4000-8000-000000000001') as demo_batch_id \gset

select case when count(*) = 1 then 1 else 1/0 end
from public.demo_seed_batches
where id = :'demo_batch_id'::uuid
  and school_id = '10000000-0000-4000-8000-000000000001'
  and status = 'active';

select case when count(*) = 20 then 1 else 1/0 end
from public.demo_seed_records
where batch_id = :'demo_batch_id'::uuid and entity_type = 'student';
select case when count(*) = 2 then 1 else 1/0 end
from public.demo_seed_records
where batch_id = :'demo_batch_id'::uuid and entity_type = 'teacher';
select case when count(*) = 2 then 1 else 1/0 end
from public.demo_seed_records
where batch_id = :'demo_batch_id'::uuid and entity_type = 'class';
select case when count(*) = 12 then 1 else 1/0 end
from public.demo_seed_records
where batch_id = :'demo_batch_id'::uuid and entity_type = 'attendance_session';
select case when count(*) = 120 then 1 else 1/0 end
from public.demo_seed_records
where batch_id = :'demo_batch_id'::uuid and entity_type = 'attendance_record';
select case when count(*) = 40 then 1 else 1/0 end
from public.demo_seed_records
where batch_id = :'demo_batch_id'::uuid and entity_type = 'memorization_record';
select case when count(*) = 20 then 1 else 1/0 end
from public.demo_seed_records
where batch_id = :'demo_batch_id'::uuid and entity_type = 'student_charge';
select case when count(*) = 14 then 1 else 1/0 end
from public.demo_seed_records
where batch_id = :'demo_batch_id'::uuid and entity_type = 'payment';
select case when count(*) = 3 then 1 else 1/0 end
from public.demo_seed_records
where batch_id = :'demo_batch_id'::uuid and entity_type = 'expense';

-- Education metadata is structured and stage-specific.
select case when count(*) = 20 then 1 else 1/0 end
from public.students s
join public.demo_seed_records r
  on r.batch_id = :'demo_batch_id'::uuid
 and r.entity_type = 'student'
 and r.record_id = s.id
where s.education_level in ('primary','middle','secondary','university')
  and (
    (s.education_level = 'primary' and s.education_year between 1 and 5)
    or (s.education_level = 'middle' and s.education_year between 1 and 4)
    or (s.education_level = 'secondary' and s.education_year between 1 and 3)
    or (s.education_level = 'university' and s.education_year between 1 and 10)
  );

-- Status RPC reports exactly the tracked presentation surface.
select case when active and student_count = 20 and teacher_count = 2 and class_count = 2 then 1 else 1/0 end
from public.get_school_demo_status('10000000-0000-4000-8000-000000000001');

-- A second active batch is rejected.
do $$
begin
  begin
    perform public.create_school_demo_data('10000000-0000-4000-8000-000000000001');
    raise exception 'second active demo batch unexpectedly allowed';
  exception
    when raise_exception then
      if sqlerrm <> 'demo_already_active' then raise; end if;
  end;
end
$$;

-- Cleanup refuses to delete a real student that was placed into a demo class.
select record_id as demo_class_id
from public.demo_seed_records
where batch_id = :'demo_batch_id'::uuid and entity_type = 'class'
order by record_id
limit 1 \gset

update public.students
set class_id = :'demo_class_id'::uuid
where id = '50000000-0000-4000-8000-000000000001';

do $$
begin
  begin
    perform public.clear_school_demo_data('10000000-0000-4000-8000-000000000001');
    raise exception 'cleanup unexpectedly deleted around a real student';
  exception
    when raise_exception then
      if sqlerrm <> 'demo_cleanup_blocked_real_student_in_demo_class' then raise; end if;
  end;
end
$$;

update public.students
set class_id = null
where id = '50000000-0000-4000-8000-000000000001';

select case when public.clear_school_demo_data('10000000-0000-4000-8000-000000000001') = 20 then 1 else 1/0 end;

select case when status = 'cleared' and cleared_at is not null then 1 else 1/0 end
from public.demo_seed_batches where id = :'demo_batch_id'::uuid;

select case when not active and student_count = 0 and teacher_count = 0 and class_count = 0 then 1 else 1/0 end
from public.get_school_demo_status('10000000-0000-4000-8000-000000000001');

-- Existing fixture data survives demo cleanup exactly.
select case when
  (select count(*) from public.students where school_id = '10000000-0000-4000-8000-000000000001') = b.students
  and (select count(*) from public.teachers where school_id = '10000000-0000-4000-8000-000000000001') = b.teachers
  and (select count(*) from public.classes where school_id = '10000000-0000-4000-8000-000000000001') = b.classes
then 1 else 1/0 end
from demo_baseline b;

-- Direct tracking-table access remains unavailable to browser roles.
select case when not has_table_privilege('authenticated', 'public.demo_seed_batches', 'SELECT') then 1 else 1/0 end;
select case when not has_table_privilege('authenticated', 'public.demo_seed_records', 'SELECT') then 1 else 1/0 end;
select case when not has_table_privilege('anon', 'public.demo_seed_batches', 'SELECT') then 1 else 1/0 end;

-- RPC exposure is authenticated-only.
select case when has_function_privilege('authenticated', 'public.get_school_demo_status(uuid)', 'EXECUTE') then 1 else 1/0 end;
select case when has_function_privilege('authenticated', 'public.create_school_demo_data(uuid)', 'EXECUTE') then 1 else 1/0 end;
select case when has_function_privilege('authenticated', 'public.clear_school_demo_data(uuid)', 'EXECUTE') then 1 else 1/0 end;
select case when not has_function_privilege('anon', 'public.create_school_demo_data(uuid)', 'EXECUTE') then 1 else 1/0 end;
select case when not has_function_privilege('public', 'public.create_school_demo_data(uuid)', 'EXECUTE') then 1 else 1/0 end;

-- Private child-photo bucket and scoped Storage policies exist.
select case when public = false and file_size_limit = 5242880 then 1 else 1/0 end
from storage.buckets where id = 'student-photos';
select case when count(*) = 4 then 1 else 1/0 end
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'student photos scoped %';

-- Migration constraints accept null legacy education and reject invalid year pairs.
insert into public.students (
  id, school_id, branch_id, first_name, last_name, birth_date, gender,
  guardian_name, guardian_relation, guardian_phone, start_date, status,
  created_by
) values (
  '5f000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'Legacy', 'Education Null', '2015-01-01', 'male',
  'Contact', 'father', '000', current_date, 'active',
  '60000000-0000-4000-8000-000000000001'
);
delete from public.students where id = '5f000000-0000-4000-8000-000000000001';

do $$
begin
  begin
    insert into public.students (
      id, school_id, branch_id, first_name, last_name, birth_date, gender,
      education_level, education_year, guardian_name, guardian_relation,
      guardian_phone, start_date, status, created_by
    ) values (
      '5f000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'Invalid', 'Education Year', '2015-01-01', 'male',
      'primary', 6, 'Contact', 'father', '000', current_date, 'active',
      '60000000-0000-4000-8000-000000000001'
    );
    raise exception 'invalid education year unexpectedly accepted';
  exception when check_violation then null;
  end;
end
$$;