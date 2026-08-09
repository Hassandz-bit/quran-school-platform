-- QuranOS launch enhancement: safe demo data lifecycle + structured student education + private photos.
-- This migration is intentionally backward-compatible with existing students and staff data.

alter table public.students
  add column if not exists education_year smallint,
  add column if not exists photo_path text;

alter table public.students
  drop constraint if exists students_education_level_check;
alter table public.students
  add constraint students_education_level_check
  check (
    education_level is null
    or education_level = any (array['primary'::text, 'middle'::text, 'secondary'::text, 'university'::text])
  );

alter table public.students
  drop constraint if exists students_education_year_check;
alter table public.students
  add constraint students_education_year_check
  check (
    (education_level is null and education_year is null)
    or (education_level = 'primary' and education_year between 1 and 5)
    or (education_level = 'middle' and education_year between 1 and 4)
    or (education_level = 'secondary' and education_year between 1 and 3)
    or (education_level = 'university' and education_year between 1 and 10)
  );

alter table public.students
  drop constraint if exists students_photo_path_scope_check;
alter table public.students
  add constraint students_photo_path_scope_check
  check (
    photo_path is null
    or (
      split_part(photo_path, '/', 1) = school_id::text
      and split_part(photo_path, '/', 2) = id::text
      and photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$'
    )
  );

comment on column public.students.education_level is
  'Structured education stage: primary, middle, secondary, or university.';
comment on column public.students.education_year is
  'Year within the selected education stage; stage-specific range is enforced.';
comment on column public.students.photo_path is
  'Private student photo object path in the student-photos Storage bucket; never a public URL.';

create table if not exists public.demo_seed_batches (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  created_by uuid not null references public.profiles(id),
  status text not null default 'active' check (status = any (array['active'::text, 'cleared'::text])),
  created_at timestamptz not null default now(),
  cleared_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (id, school_id)
);

create unique index if not exists demo_seed_batches_one_active_per_school_idx
  on public.demo_seed_batches (school_id)
  where status = 'active';

create table if not exists public.demo_seed_records (
  batch_id uuid not null,
  school_id uuid not null,
  entity_type text not null check (
    entity_type = any (array[
      'class'::text,
      'teacher'::text,
      'class_teacher'::text,
      'student'::text,
      'attendance_session'::text,
      'attendance_record'::text,
      'memorization_record'::text,
      'fee_plan'::text,
      'student_charge'::text,
      'payment'::text,
      'expense'::text
    ])
  ),
  record_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (batch_id, entity_type, record_id),
  constraint demo_seed_records_batch_school_fk
    foreign key (batch_id, school_id)
    references public.demo_seed_batches(id, school_id)
    on delete cascade
);

create index if not exists demo_seed_records_school_batch_idx
  on public.demo_seed_records (school_id, batch_id, entity_type);

alter table public.demo_seed_batches enable row level security;
alter table public.demo_seed_records enable row level security;

revoke all on table public.demo_seed_batches from public, anon, authenticated;
revoke all on table public.demo_seed_records from public, anon, authenticated;

create or replace function public.get_school_demo_status(target_school_id uuid)
returns table (
  active boolean,
  batch_id uuid,
  created_at timestamptz,
  student_count integer,
  teacher_count integer,
  class_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_batch public.demo_seed_batches%rowtype;
begin
  if target_school_id is null
     or not public.has_school_permission(target_school_id, 'school.update') then
    raise exception using errcode = '42501', message = 'demo_access_denied';
  end if;

  select * into current_batch
  from public.demo_seed_batches b
  where b.school_id = target_school_id and b.status = 'active'
  order by b.created_at desc
  limit 1;

  if not found then
    return query select false, null::uuid, null::timestamptz, 0, 0, 0;
    return;
  end if;

  return query
  select
    true,
    current_batch.id,
    current_batch.created_at,
    count(*) filter (where r.entity_type = 'student')::integer,
    count(*) filter (where r.entity_type = 'teacher')::integer,
    count(*) filter (where r.entity_type = 'class')::integer
  from public.demo_seed_records r
  where r.batch_id = current_batch.id and r.school_id = target_school_id;
end;
$$;

create or replace function public.create_school_demo_data(target_school_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  main_branch_id uuid;
  new_batch_id uuid;
  batch_suffix text;
  class_one_id uuid;
  class_two_id uuid;
  teacher_one_id uuid;
  teacher_two_id uuid;
  assignment_id uuid;
  student_id uuid;
  session_id uuid;
  attendance_id uuid;
  memorization_id uuid;
  fee_plan_id uuid;
  charge_id uuid;
  payment_id uuid;
  expense_id uuid;
  selected_class_id uuid;
  selected_teacher_id uuid;
  attendance_status text;
  i integer;
  day_index integer;
  record_index integer;
  student_row record;
  first_names text[] := array[
    'يوسف','مريم','عبد الرحمن','آية','محمد','سارة','إبراهيم','خديجة','ياسين','إسراء',
    'معاذ','رتيل','أيوب','يقين','أنس','تسنيم','حمزة','صفاء','بلال','لينا'
  ];
  last_names text[] := array[
    'بن عمر','بوقرة','محرزي','قاسمي','بن صالح','عماري','فرحات','حمودي','زروقي','عباسي',
    'بن يوسف','طاهري','سعيدي','عيساوي','براهيمي','شرقي','قادري','منصوري','رحماني','بلقاسم'
  ];
  stages text[] := array[
    'primary','primary','primary','primary','primary',
    'middle','middle','middle','middle','middle',
    'secondary','secondary','secondary','secondary','secondary',
    'university','university','university','university','university'
  ];
  years smallint[] := array[1,2,3,4,5,1,2,3,4,2,1,2,3,1,2,1,2,3,4,5];
begin
  if actor_id is null
     or target_school_id is null
     or not public.has_school_permission(target_school_id, 'school.update') then
    raise exception using errcode = '42501', message = 'demo_access_denied';
  end if;

  if exists (
    select 1 from public.demo_seed_batches
    where school_id = target_school_id and status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'demo_already_active';
  end if;

  select b.id into main_branch_id
  from public.branches b
  where b.school_id = target_school_id and b.status = 'active'
  order by b.is_main desc, b.created_at asc
  limit 1;

  if main_branch_id is null then
    raise exception using errcode = 'P0001', message = 'demo_requires_active_branch';
  end if;

  insert into public.demo_seed_batches (school_id, created_by)
  values (target_school_id, actor_id)
  returning id into new_batch_id;

  batch_suffix := upper(substr(replace(new_batch_id::text, '-', ''), 1, 8));

  insert into public.classes (
    school_id, branch_id, name, code, schedule_label, status, created_by
  ) values (
    target_school_id, main_branch_id, 'حلقة الفجر التجريبية', 'DEMO_FJR_' || batch_suffix,
    'بعد صلاة الفجر', 'active', actor_id
  ) returning id into class_one_id;

  insert into public.demo_seed_records values
    (new_batch_id, target_school_id, 'class', class_one_id, now());

  insert into public.classes (
    school_id, branch_id, name, code, schedule_label, status, created_by
  ) values (
    target_school_id, main_branch_id, 'حلقة المساء التجريبية', 'DEMO_MSA_' || batch_suffix,
    'بعد صلاة العصر', 'active', actor_id
  ) returning id into class_two_id;

  insert into public.demo_seed_records values
    (new_batch_id, target_school_id, 'class', class_two_id, now());

  insert into public.teachers (
    school_id, branch_id, first_name, last_name, gender, specialization,
    qualification, hire_date, status, notes, created_by
  ) values (
    target_school_id, main_branch_id, 'أحمد', 'المعلم التجريبي', 'male',
    'تحفيظ القرآن الكريم', 'إجازة في القرآن', current_date - 180,
    'active', 'بيانات عرض تجريبية قابلة للمسح.', actor_id
  ) returning id into teacher_one_id;

  insert into public.demo_seed_records values
    (new_batch_id, target_school_id, 'teacher', teacher_one_id, now());

  insert into public.teachers (
    school_id, branch_id, first_name, last_name, gender, specialization,
    qualification, hire_date, status, notes, created_by
  ) values (
    target_school_id, main_branch_id, 'مريم', 'المعلمة التجريبية', 'female',
    'التجويد والمراجعة', 'شهادة تعليم القرآن', current_date - 150,
    'active', 'بيانات عرض تجريبية قابلة للمسح.', actor_id
  ) returning id into teacher_two_id;

  insert into public.demo_seed_records values
    (new_batch_id, target_school_id, 'teacher', teacher_two_id, now());

  insert into public.class_teachers (
    school_id, branch_id, class_id, teacher_id, assignment_role, status, assigned_at, created_by
  ) values (
    target_school_id, main_branch_id, class_one_id, teacher_one_id, 'primary', 'active', current_date - 120, actor_id
  ) returning id into assignment_id;
  insert into public.demo_seed_records values
    (new_batch_id, target_school_id, 'class_teacher', assignment_id, now());

  insert into public.class_teachers (
    school_id, branch_id, class_id, teacher_id, assignment_role, status, assigned_at, created_by
  ) values (
    target_school_id, main_branch_id, class_two_id, teacher_two_id, 'primary', 'active', current_date - 120, actor_id
  ) returning id into assignment_id;
  insert into public.demo_seed_records values
    (new_batch_id, target_school_id, 'class_teacher', assignment_id, now());

  for i in 1..20 loop
    selected_class_id := case when i <= 10 then class_one_id else class_two_id end;

    insert into public.students (
      school_id, branch_id, class_id, first_name, last_name, birth_date, gender,
      phone, address, previous_school, education_level, education_year,
      guardian_name, guardian_relation, guardian_phone, start_date, status,
      birth_certificate_provided, photos_provided, medical_report_provided,
      previous_certificate_provided, created_by
    ) values (
      target_school_id,
      main_branch_id,
      selected_class_id,
      first_names[i],
      last_names[i],
      (date '2007-01-15' + (i * 170))::date,
      case when i % 2 = 0 then 'female' else 'male' end,
      null,
      'عنوان تجريبي — الجزائر',
      'مؤسسة تعليمية تجريبية',
      stages[i],
      years[i],
      case when i % 2 = 0 then 'أم الطالب — تجريبي' else 'أب الطالب — تجريبي' end,
      case when i % 2 = 0 then 'mother' else 'father' end,
      '0000000000',
      current_date - (80 + i),
      'active',
      true,
      false,
      false,
      true,
      actor_id
    ) returning id into student_id;

    insert into public.demo_seed_records values
      (new_batch_id, target_school_id, 'student', student_id, now());
  end loop;

  for record_index in 1..2 loop
    selected_class_id := case when record_index = 1 then class_one_id else class_two_id end;
    selected_teacher_id := case when record_index = 1 then teacher_one_id else teacher_two_id end;

    for day_index in 1..6 loop
      insert into public.attendance_sessions (
        school_id, branch_id, class_id, session_date, created_by
      ) values (
        target_school_id, main_branch_id, selected_class_id,
        current_date - (day_index * 3), actor_id
      ) returning id into session_id;

      insert into public.demo_seed_records values
        (new_batch_id, target_school_id, 'attendance_session', session_id, now());

      for student_row in
        select s.id, row_number() over (order by s.created_at, s.id)::integer as seq
        from public.students s
        join public.demo_seed_records r
          on r.batch_id = new_batch_id
         and r.school_id = target_school_id
         and r.entity_type = 'student'
         and r.record_id = s.id
        where s.class_id = selected_class_id
      loop
        attendance_status := case
          when (student_row.seq + day_index) % 11 = 0 then 'absent'
          when (student_row.seq + day_index) % 7 = 0 then 'excused_absence'
          when (student_row.seq + day_index) % 5 = 0 then 'late'
          else 'present'
        end;

        insert into public.attendance_records (
          school_id, branch_id, class_id, session_id, student_id, status,
          arrival_time, note, recorded_by, last_modified_by
        ) values (
          target_school_id, main_branch_id, selected_class_id, session_id,
          student_row.id, attendance_status,
          case when attendance_status = 'late' then time '08:12' else null end,
          case when attendance_status = 'excused_absence' then 'غياب بعذر — بيانات تجريبية' else null end,
          actor_id, actor_id
        ) returning id into attendance_id;

        insert into public.demo_seed_records values
          (new_batch_id, target_school_id, 'attendance_record', attendance_id, now());
      end loop;
    end loop;

    for student_row in
      select s.id, row_number() over (order by s.created_at, s.id)::integer as seq
      from public.students s
      join public.demo_seed_records r
        on r.batch_id = new_batch_id
       and r.school_id = target_school_id
       and r.entity_type = 'student'
       and r.record_id = s.id
      where s.class_id = selected_class_id
    loop
      for day_index in 1..2 loop
        insert into public.memorization_records (
          school_id, branch_id, class_id, student_id, teacher_id, record_date,
          session_type, surah_number, ayah_start, ayah_end, rating, errors_count,
          notes, next_assignment, recorded_by, last_modified_by
        ) values (
          target_school_id, main_branch_id, selected_class_id, student_row.id,
          selected_teacher_id, current_date - (day_index * 4 + (student_row.seq % 3)),
          case when day_index = 1 then 'new_memorization' else 'near_revision' end,
          case when record_index = 1 then 67 else 78 end,
          1 + ((student_row.seq - 1) % 4),
          5 + ((student_row.seq - 1) % 4),
          greatest(3, 5 - ((student_row.seq + day_index) % 3))::smallint,
          ((student_row.seq + day_index) % 4)::smallint,
          'متابعة تجريبية لإظهار مستوى الطالب.',
          'مراجعة المقطع وإتمام خمس آيات جديدة.',
          actor_id, actor_id
        ) returning id into memorization_id;

        insert into public.demo_seed_records values
          (new_batch_id, target_school_id, 'memorization_record', memorization_id, now());
      end loop;
    end loop;
  end loop;

  insert into public.fee_plans (
    school_id, branch_id, name, code, billing_cycle, amount, currency,
    due_day, status, description, created_by
  ) values (
    target_school_id, main_branch_id, 'الاشتراك الشهري التجريبي',
    'DEMO_FEE_' || batch_suffix, 'monthly', 1500, 'DZD', 10,
    'active', 'خطة تجريبية لإظهار المالية.', actor_id
  ) returning id into fee_plan_id;

  insert into public.demo_seed_records values
    (new_batch_id, target_school_id, 'fee_plan', fee_plan_id, now());

  for student_row in
    select s.id, row_number() over (order by s.created_at, s.id)::integer as seq
    from public.students s
    join public.demo_seed_records r
      on r.batch_id = new_batch_id
     and r.school_id = target_school_id
     and r.entity_type = 'student'
     and r.record_id = s.id
  loop
    insert into public.student_charges (
      school_id, branch_id, student_id, fee_plan_id, charge_type,
      period_start, period_end, description, original_amount, discount_amount,
      due_date, status, created_by
    ) values (
      target_school_id, main_branch_id, student_row.id, fee_plan_id, 'fee',
      date_trunc('month', current_date)::date,
      (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
      'اشتراك شهري — بيانات تجريبية', 1500, 0,
      current_date - case when student_row.seq % 4 = 0 then 5 else -5 end,
      case
        when student_row.seq <= 8 then 'paid'
        when student_row.seq <= 14 then 'partially_paid'
        else 'pending'
      end,
      actor_id
    ) returning id into charge_id;

    insert into public.demo_seed_records values
      (new_batch_id, target_school_id, 'student_charge', charge_id, now());

    if student_row.seq <= 14 then
      insert into public.payments (
        school_id, branch_id, student_id, charge_id, amount, payment_method,
        payment_date, reference_number, notes, status, received_by
      ) values (
        target_school_id, main_branch_id, student_row.id, charge_id,
        case when student_row.seq <= 8 then 1500 else 750 end,
        case when student_row.seq % 3 = 0 then 'postal' else 'cash' end,
        current_date - (student_row.seq % 6),
        'DEMO-' || lpad(student_row.seq::text, 3, '0'),
        'دفعة تجريبية.', 'completed', actor_id
      ) returning id into payment_id;

      insert into public.demo_seed_records values
        (new_batch_id, target_school_id, 'payment', payment_id, now());
    end if;
  end loop;

  insert into public.expenses (
    school_id, branch_id, category, description, amount, expense_date,
    payment_method, status, notes, created_by
  ) values (
    target_school_id, main_branch_id, 'supplies', 'مستلزمات الحلقة — تجريبي', 3200,
    current_date - 12, 'cash', 'recorded', 'بيانات عرض تجريبية.', actor_id
  ) returning id into expense_id;
  insert into public.demo_seed_records values
    (new_batch_id, target_school_id, 'expense', expense_id, now());

  insert into public.expenses (
    school_id, branch_id, category, description, amount, expense_date,
    payment_method, status, notes, created_by
  ) values (
    target_school_id, main_branch_id, 'maintenance', 'صيانة وتجهيزات — تجريبي', 4500,
    current_date - 24, 'cash', 'recorded', 'بيانات عرض تجريبية.', actor_id
  ) returning id into expense_id;
  insert into public.demo_seed_records values
    (new_batch_id, target_school_id, 'expense', expense_id, now());

  insert into public.expenses (
    school_id, branch_id, category, description, amount, expense_date,
    payment_method, status, notes, created_by
  ) values (
    target_school_id, main_branch_id, 'activities', 'نشاط تحفيزي — تجريبي', 2500,
    current_date - 7, 'cash', 'recorded', 'بيانات عرض تجريبية.', actor_id
  ) returning id into expense_id;
  insert into public.demo_seed_records values
    (new_batch_id, target_school_id, 'expense', expense_id, now());

  return new_batch_id;
end;
$$;

create or replace function public.clear_school_demo_data(target_school_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target_batch_id uuid;
  deleted_students integer := 0;
begin
  if auth.uid() is null
     or target_school_id is null
     or not public.has_school_permission(target_school_id, 'school.update') then
    raise exception using errcode = '42501', message = 'demo_access_denied';
  end if;

  select b.id into target_batch_id
  from public.demo_seed_batches b
  where b.school_id = target_school_id and b.status = 'active'
  order by b.created_at desc
  limit 1;

  if target_batch_id is null then
    return 0;
  end if;

  if exists (
    select 1
    from public.teacher_invitations ti
    join public.demo_seed_records r
      on r.batch_id = target_batch_id
     and r.school_id = target_school_id
     and r.entity_type = 'teacher'
     and r.record_id = ti.teacher_id
  ) then
    raise exception using errcode = 'P0001', message = 'demo_cleanup_blocked_teacher_invitation';
  end if;

  if exists (
    select 1
    from public.student_guardians sg
    join public.demo_seed_records r
      on r.batch_id = target_batch_id
     and r.school_id = target_school_id
     and r.entity_type = 'student'
     and r.record_id = sg.student_id
  ) or exists (
    select 1
    from public.guardian_invitations gi
    join public.demo_seed_records r
      on r.batch_id = target_batch_id
     and r.school_id = target_school_id
     and r.entity_type = 'student'
     and r.record_id = gi.student_id
  ) then
    raise exception using errcode = 'P0001', message = 'demo_cleanup_blocked_guardian_link';
  end if;

  if exists (
    select 1
    from public.students s
    join public.demo_seed_records c
      on c.batch_id = target_batch_id
     and c.school_id = target_school_id
     and c.entity_type = 'class'
     and c.record_id = s.class_id
    where not exists (
      select 1 from public.demo_seed_records ds
      where ds.batch_id = target_batch_id
        and ds.school_id = target_school_id
        and ds.entity_type = 'student'
        and ds.record_id = s.id
    )
  ) then
    raise exception using errcode = 'P0001', message = 'demo_cleanup_blocked_real_student_in_demo_class';
  end if;

  if exists (
    select 1
    from public.memorization_records mr
    join public.demo_seed_records tr
      on tr.batch_id = target_batch_id
     and tr.school_id = target_school_id
     and tr.entity_type = 'teacher'
     and tr.record_id = mr.teacher_id
    where not exists (
      select 1 from public.demo_seed_records sr
      where sr.batch_id = target_batch_id
        and sr.school_id = target_school_id
        and sr.entity_type = 'student'
        and sr.record_id = mr.student_id
    )
  ) then
    raise exception using errcode = 'P0001', message = 'demo_cleanup_blocked_real_memorization_with_demo_teacher';
  end if;

  delete from public.attendance_record_history h
  where h.attendance_record_id in (
    select ar.id
    from public.attendance_records ar
    where ar.school_id = target_school_id
      and (
        ar.student_id in (
          select record_id from public.demo_seed_records
          where batch_id = target_batch_id and entity_type = 'student'
        )
        or ar.class_id in (
          select record_id from public.demo_seed_records
          where batch_id = target_batch_id and entity_type = 'class'
        )
      )
  );

  delete from public.attendance_records ar
  where ar.school_id = target_school_id
    and (
      ar.student_id in (
        select record_id from public.demo_seed_records
        where batch_id = target_batch_id and entity_type = 'student'
      )
      or ar.class_id in (
        select record_id from public.demo_seed_records
        where batch_id = target_batch_id and entity_type = 'class'
      )
    );

  delete from public.attendance_sessions s
  where s.school_id = target_school_id
    and s.class_id in (
      select record_id from public.demo_seed_records
      where batch_id = target_batch_id and entity_type = 'class'
    );

  delete from public.memorization_record_history h
  where h.memorization_record_id in (
    select mr.id
    from public.memorization_records mr
    where mr.school_id = target_school_id
      and (
        mr.student_id in (
          select record_id from public.demo_seed_records
          where batch_id = target_batch_id and entity_type = 'student'
        )
        or mr.class_id in (
          select record_id from public.demo_seed_records
          where batch_id = target_batch_id and entity_type = 'class'
        )
      )
  );

  delete from public.memorization_records mr
  where mr.school_id = target_school_id
    and (
      mr.student_id in (
        select record_id from public.demo_seed_records
        where batch_id = target_batch_id and entity_type = 'student'
      )
      or mr.class_id in (
        select record_id from public.demo_seed_records
        where batch_id = target_batch_id and entity_type = 'class'
      )
    );

  delete from public.payments p
  where p.school_id = target_school_id
    and p.student_id in (
      select record_id from public.demo_seed_records
      where batch_id = target_batch_id and entity_type = 'student'
    );

  delete from public.student_discounts d
  where d.school_id = target_school_id
    and d.student_id in (
      select record_id from public.demo_seed_records
      where batch_id = target_batch_id and entity_type = 'student'
    );

  delete from public.student_charges c
  where c.school_id = target_school_id
    and c.student_id in (
      select record_id from public.demo_seed_records
      where batch_id = target_batch_id and entity_type = 'student'
    );

  delete from public.class_teachers ct
  where ct.school_id = target_school_id
    and (
      ct.class_id in (
        select record_id from public.demo_seed_records
        where batch_id = target_batch_id and entity_type = 'class'
      )
      or ct.teacher_id in (
        select record_id from public.demo_seed_records
        where batch_id = target_batch_id and entity_type = 'teacher'
      )
    );

  delete from public.expenses e
  where e.school_id = target_school_id
    and e.id in (
      select record_id from public.demo_seed_records
      where batch_id = target_batch_id and entity_type = 'expense'
    );

  delete from public.fee_plans f
  where f.school_id = target_school_id
    and f.id in (
      select record_id from public.demo_seed_records
      where batch_id = target_batch_id and entity_type = 'fee_plan'
    );

  delete from public.students s
  where s.school_id = target_school_id
    and s.id in (
      select record_id from public.demo_seed_records
      where batch_id = target_batch_id and entity_type = 'student'
    );
  get diagnostics deleted_students = row_count;

  delete from public.teachers t
  where t.school_id = target_school_id
    and t.id in (
      select record_id from public.demo_seed_records
      where batch_id = target_batch_id and entity_type = 'teacher'
    );

  delete from public.classes c
  where c.school_id = target_school_id
    and c.id in (
      select record_id from public.demo_seed_records
      where batch_id = target_batch_id and entity_type = 'class'
    );

  delete from public.demo_seed_records
  where batch_id = target_batch_id and school_id = target_school_id;

  update public.demo_seed_batches
  set status = 'cleared', cleared_at = now(), updated_at = now()
  where id = target_batch_id and school_id = target_school_id;

  return deleted_students;
end;
$$;

revoke all on function public.get_school_demo_status(uuid) from public, anon;
revoke all on function public.create_school_demo_data(uuid) from public, anon;
revoke all on function public.clear_school_demo_data(uuid) from public, anon;
grant execute on function public.get_school_demo_status(uuid) to authenticated;
grant execute on function public.create_school_demo_data(uuid) to authenticated;
grant execute on function public.clear_school_demo_data(uuid) to authenticated;

-- Student photos are sensitive child data. Keep the bucket private and use RLS.
-- Supabase recommends private buckets for assets that require per-request authorization.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'student-photos',
      'student-photos',
      false,
      5242880,
      array['image/jpeg','image/png','image/webp']::text[]
    )
    on conflict (id) do update
      set public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end
$$;

do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  execute 'drop policy if exists "student photos scoped read" on storage.objects';
  execute 'drop policy if exists "student photos scoped insert" on storage.objects';
  execute 'drop policy if exists "student photos scoped update" on storage.objects';
  execute 'drop policy if exists "student photos scoped delete" on storage.objects';

  execute $policy$
    create policy "student photos scoped read"
    on storage.objects for select to authenticated
    using (
      bucket_id = 'student-photos'
      and exists (
        select 1
        from public.students s
        where s.school_id::text = (storage.foldername(name))[1]
          and s.id::text = (storage.foldername(name))[2]
          and (
            public.has_school_permission(s.school_id, 'students.view')
            or public.has_school_permission(s.school_id, 'students.manage')
            or public.has_branch_permission(s.school_id, s.branch_id, 'students.view')
            or public.has_branch_permission(s.school_id, s.branch_id, 'students.manage')
          )
      )
    )
  $policy$;

  execute $policy$
    create policy "student photos scoped insert"
    on storage.objects for insert to authenticated
    with check (
      bucket_id = 'student-photos'
      and exists (
        select 1
        from public.students s
        where s.school_id::text = (storage.foldername(name))[1]
          and s.id::text = (storage.foldername(name))[2]
          and (
            public.has_school_permission(s.school_id, 'students.manage')
            or public.has_branch_permission(s.school_id, s.branch_id, 'students.manage')
          )
      )
    )
  $policy$;

  execute $policy$
    create policy "student photos scoped update"
    on storage.objects for update to authenticated
    using (
      bucket_id = 'student-photos'
      and exists (
        select 1 from public.students s
        where s.school_id::text = (storage.foldername(name))[1]
          and s.id::text = (storage.foldername(name))[2]
          and (
            public.has_school_permission(s.school_id, 'students.manage')
            or public.has_branch_permission(s.school_id, s.branch_id, 'students.manage')
          )
      )
    )
    with check (
      bucket_id = 'student-photos'
      and exists (
        select 1 from public.students s
        where s.school_id::text = (storage.foldername(name))[1]
          and s.id::text = (storage.foldername(name))[2]
          and (
            public.has_school_permission(s.school_id, 'students.manage')
            or public.has_branch_permission(s.school_id, s.branch_id, 'students.manage')
          )
      )
    )
  $policy$;

  execute $policy$
    create policy "student photos scoped delete"
    on storage.objects for delete to authenticated
    using (
      bucket_id = 'student-photos'
      and exists (
        select 1 from public.students s
        where s.school_id::text = (storage.foldername(name))[1]
          and s.id::text = (storage.foldername(name))[2]
          and (
            public.has_school_permission(s.school_id, 'students.manage')
            or public.has_branch_permission(s.school_id, s.branch_id, 'students.manage')
          )
      )
    )
  $policy$;
end
$$;