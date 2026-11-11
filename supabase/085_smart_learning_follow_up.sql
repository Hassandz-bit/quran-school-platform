-- QuranOS: explicit learning targets, follow-up dashboard, and role-scoped alerts.
-- Targets make "not memorized / not reviewed" measurable without inferring from missing records.

begin;

create table public.student_learning_targets (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  branch_id uuid not null,
  class_id uuid not null,
  student_id uuid not null references public.students(id) on delete cascade,
  target_type text not null check (target_type in ('new_memorization', 'revision')),
  surah_number smallint not null,
  ayah_start smallint not null,
  ayah_end smallint not null,
  assigned_on date not null default current_date,
  due_on date not null,
  note text,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  assigned_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_targets_class_scope_fk
    foreign key (school_id, branch_id, class_id)
    references public.classes(school_id, branch_id, id) on delete cascade,
  constraint learning_targets_surah_range_check
    check (
      surah_number between 1 and 114
      and ayah_start between 1 and public.quran_surah_ayah_count(surah_number)
      and ayah_end between 1 and public.quran_surah_ayah_count(surah_number)
      and ayah_start <= ayah_end
    ),
  constraint learning_targets_dates_check check (due_on >= assigned_on),
  constraint learning_targets_note_check
    check (note is null or char_length(btrim(note)) between 1 and 500),
  constraint learning_targets_scope_id_unique
    unique (school_id, branch_id, class_id, id)
);

comment on table public.student_learning_targets is
  'Teacher-assigned Quran passages for new memorization or revision; missing records alone never imply an unmemorized passage.';

create index student_learning_targets_student_due_idx
  on public.student_learning_targets (school_id, student_id, due_on desc)
  where status = 'active';
create index student_learning_targets_class_due_idx
  on public.student_learning_targets (school_id, branch_id, class_id, due_on)
  where status = 'active';

create trigger student_learning_targets_set_updated_at
before update on public.student_learning_targets
for each row execute function public.set_updated_at();

alter table public.student_learning_targets enable row level security;
revoke all on public.student_learning_targets from public, anon, authenticated;
grant select on public.student_learning_targets to authenticated;
grant insert (
  school_id, branch_id, class_id, student_id, target_type,
  surah_number, ayah_start, ayah_end, assigned_on, due_on, note
) on public.student_learning_targets to authenticated;
grant update (due_on, note, status) on public.student_learning_targets to authenticated;

create policy learning_targets_select_authorized
on public.student_learning_targets for select to authenticated
using (
  public.can_access_memorization_class(school_id, branch_id, class_id, 'memorization.view')
  or public.can_access_memorization_class(school_id, branch_id, class_id, 'memorization.manage')
);

create policy learning_targets_insert_authorized
on public.student_learning_targets for insert to authenticated
with check (
  assigned_by = (select auth.uid())
  and exists (
    select 1 from public.students student
    where student.id = student_id
      and student.school_id = school_id
      and student.branch_id = branch_id
      and student.class_id = class_id
      and student.status = 'active'
  )
  and public.can_access_memorization_class(school_id, branch_id, class_id, 'memorization.manage')
);

create policy learning_targets_update_authorized
on public.student_learning_targets for update to authenticated
using (
  public.can_access_memorization_class(school_id, branch_id, class_id, 'memorization.manage')
)
with check (
  public.can_access_memorization_class(school_id, branch_id, class_id, 'memorization.manage')
);

-- Read-only dashboard for teachers and authorized school/branch managers.
create or replace function public.get_learning_follow_up_dashboard(
  target_school_id uuid,
  target_branch_id uuid default null,
  target_class_id uuid default null,
  target_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'LEARNING_FOLLOW_UP_AUTH_REQUIRED';
  end if;
  if target_limit is null or target_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'LEARNING_FOLLOW_UP_LIMIT_INVALID';
  end if;
  if not exists (
    select 1 from public.classes c
    where c.school_id = target_school_id and c.status = 'active'
      and (target_branch_id is null or c.branch_id = target_branch_id)
      and (target_class_id is null or c.id = target_class_id)
      and (
        public.can_access_memorization_class(c.school_id,c.branch_id,c.id,'memorization.view')
        or public.can_access_memorization_class(c.school_id,c.branch_id,c.id,'memorization.manage')
      )
  ) then
    raise exception using errcode = '42501', message = 'LEARNING_FOLLOW_UP_SCOPE_DENIED';
  end if;

  with scoped_students as (
    select s.id, s.branch_id, s.class_id,
      concat_ws(' ',s.first_name,s.last_name) as student_name,
      c.name as class_name
    from public.students s
    join public.classes c
      on c.school_id=s.school_id and c.branch_id=s.branch_id and c.id=s.class_id
    where s.school_id=target_school_id and s.status='active' and c.status='active'
      and (target_branch_id is null or s.branch_id=target_branch_id)
      and (target_class_id is null or s.class_id=target_class_id)
      and (
        public.can_access_memorization_class(s.school_id,s.branch_id,s.class_id,'memorization.view')
        or public.can_access_memorization_class(s.school_id,s.branch_id,s.class_id,'memorization.manage')
      )
  ),
  target_rows as (
    select t.*, ss.student_name, ss.class_name,
      exists (
        select 1 from public.memorization_records mr
        where mr.school_id=t.school_id and mr.student_id=t.student_id
          and mr.surah_number=t.surah_number
          and mr.ayah_start <= t.ayah_start and mr.ayah_end >= t.ayah_end
          and mr.record_date >= t.assigned_on
          and (
            (t.target_type='new_memorization'
              and mr.session_type in ('new_memorization','new_hifz')
              and mr.recitation_result='memorized')
            or
            (t.target_type='revision'
              and mr.session_type in ('near_revision','distant_revision')
              and mr.recitation_result='revised')
          )
      ) as completed
    from public.student_learning_targets t
    join scoped_students ss on ss.id=t.student_id
    where t.school_id=target_school_id and t.status='active'
  ),
  attendance_rows as (
    select ar.student_id,
      count(*) filter (where ar.status='absent' and ats.session_date >= current_date-29)::bigint as absences_30d,
      max(ats.session_date) filter (where ar.status='absent') as last_absence
    from public.attendance_records ar
    join public.attendance_sessions ats
      on ats.school_id=ar.school_id and ats.branch_id=ar.branch_id
      and ats.class_id=ar.class_id and ats.id=ar.session_id
    join scoped_students ss on ss.id=ar.student_id
    where ar.school_id=target_school_id and ats.session_date >= current_date-29
    group by ar.student_id
  ),
  weak_rows as (
    select mr.student_id, mr.surah_number, min(mr.ayah_start) as ayah_start,
      max(mr.ayah_end) as ayah_end, count(*)::bigint as attempts,
      sum(mr.errors_count)::bigint as errors_total, avg(mr.rating)::numeric(4,2) as average_rating
    from public.memorization_records mr
    join scoped_students ss on ss.id=mr.student_id
    where mr.school_id=target_school_id and mr.record_date >= current_date-29
      and (mr.rating <= 2 or mr.errors_count >= 3
        or mr.recitation_result in ('not_memorized','not_revised'))
    group by mr.student_id,mr.surah_number
    having count(*) >= 2
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'targets_total', (select count(*) from target_rows),
      'completed', (select count(*) from target_rows where completed),
      'overdue_memorization', (select count(*) from target_rows where not completed and target_type='new_memorization' and due_on < current_date),
      'overdue_revision', (select count(*) from target_rows where not completed and target_type='revision' and due_on < current_date),
      'absence_alerts', (select count(*) from attendance_rows where absences_30d >= 2),
      'weak_passages', (select count(*) from weak_rows)
    ),
    'targets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'student_id', student_id, 'student_name', student_name,
        'class_name', class_name, 'target_type', target_type,
        'surah_number', surah_number, 'ayah_start', ayah_start, 'ayah_end', ayah_end,
        'assigned_on', assigned_on, 'due_on', due_on, 'completed', completed,
        'overdue', (not completed and due_on < current_date), 'note', note
      ) order by completed, due_on, student_name)
      from (select * from target_rows order by completed, due_on, student_name limit target_limit) q
    ), '[]'::jsonb),
    'attendance', coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_id', ss.id, 'student_name', ss.student_name,
        'class_name', ss.class_name, 'absences_30d', a.absences_30d,
        'last_absence', a.last_absence
      ) order by a.absences_30d desc, ss.student_name)
      from attendance_rows a join scoped_students ss on ss.id=a.student_id
      where a.absences_30d > 0
    ), '[]'::jsonb),
    'weak_passages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_id', ss.id, 'student_name', ss.student_name,
        'surah_number', w.surah_number, 'ayah_start', w.ayah_start,
        'ayah_end', w.ayah_end, 'attempts', w.attempts,
        'errors_total', w.errors_total, 'average_rating', w.average_rating
      ) order by w.attempts desc, ss.student_name)
      from weak_rows w join scoped_students ss on ss.id=w.student_id
    ), '[]'::jsonb)
  ) into result;

  return coalesce(result, '{}'::jsonb);
end;
$$;

revoke all on function public.get_learning_follow_up_dashboard(uuid,uuid,uuid,integer) from public, anon;
grant execute on function public.get_learning_follow_up_dashboard(uuid,uuid,uuid,integer) to authenticated;

-- Guardian read-only view: only the caller's own active linked child.
create or replace function public.list_my_guardian_learning_targets(
  target_school_id uuid,
  target_student_id uuid
)
returns table (
  target_id uuid, target_type text, surah_number smallint,
  ayah_start smallint, ayah_end smallint, assigned_on date,
  due_on date, is_completed boolean, note text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_active_guardian_of_student(target_school_id,target_student_id) then
    raise exception using errcode = '42501', message = 'GUARDIAN_STUDENT_ACCESS_DENIED';
  end if;
  return query
  select t.id,t.target_type,t.surah_number,t.ayah_start,t.ayah_end,
    t.assigned_on,t.due_on,
    exists (
      select 1 from public.memorization_records mr
      where mr.school_id=t.school_id and mr.student_id=t.student_id
        and mr.surah_number=t.surah_number
        and mr.ayah_start <= t.ayah_start and mr.ayah_end >= t.ayah_end
        and mr.record_date >= t.assigned_on
        and (
          (t.target_type='new_memorization' and mr.session_type in ('new_memorization','new_hifz') and mr.recitation_result='memorized')
          or (t.target_type='revision' and mr.session_type in ('near_revision','distant_revision') and mr.recitation_result='revised')
        )
    ),
    t.note
  from public.student_learning_targets t
  where t.school_id=target_school_id and t.student_id=target_student_id and t.status='active'
  order by t.due_on desc,t.created_at desc;
end;
$$;

revoke all on function public.list_my_guardian_learning_targets(uuid,uuid) from public, anon;
grant execute on function public.list_my_guardian_learning_targets(uuid,uuid) to authenticated;

-- Role-scoped alert writer. It deliberately never resolves or inserts student recipients.
create or replace function public.emit_learning_follow_up_alert(
  target_school_id uuid,
  target_student_id uuid,
  target_branch_id uuid,
  target_class_id uuid,
  target_source_type text,
  target_source_id uuid,
  target_event_type text,
  target_title text,
  target_body text,
  target_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_id uuid;
  recipient_category text;
begin
  if target_event_type not in ('memorization_needs_follow_up','revision_needs_follow_up','absence_needs_follow_up')
    or target_source_type not in ('learning_record','attendance_record') then
    return;
  end if;

  for recipient_id, recipient_category in
    select distinct t.profile_id, 'teachers'::text
    from public.teachers t
    join public.class_teachers ct
      on ct.school_id=t.school_id and ct.branch_id=t.branch_id
      and ct.teacher_id=t.id and ct.class_id=target_class_id and ct.status='active'
    where t.school_id=target_school_id and t.branch_id=target_branch_id
      and t.status='active' and t.profile_id is not null
    union
    select distinct sg.guardian_profile_id, 'guardians'::text
    from public.student_guardians sg
    join public.profiles p on p.id=sg.guardian_profile_id and p.status='active'
    where sg.school_id=target_school_id and sg.student_id=target_student_id and sg.status='active'
  loop
    insert into public.app_notifications (
      school_id, recipient_profile_id, sender_profile_id, student_id,
      category, event_type, title, body, target_path, source_type, source_id
    ) values (
      target_school_id, recipient_id, null, target_student_id,
      recipient_category, target_event_type, target_title, target_body,
      target_path, target_source_type || '_' || case when recipient_category='teachers' then 'teacher' else 'guardian' end,
      target_source_id
    )
    on conflict (recipient_profile_id, source_type, source_id) do nothing;
  end loop;
end;
$$;

revoke all on function public.emit_learning_follow_up_alert(uuid,uuid,uuid,uuid,text,uuid,text,text,text,text)
  from public, anon, authenticated;

create or replace function public.notify_learning_record_follow_up()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  student_name text;
  event_kind text;
  title_text text;
  body_text text;
begin
  if not (
    coalesce(new.recitation_result in ('not_memorized','not_revised'), false)
    or coalesce(new.errors_count >= 3, false)
    or coalesce(new.rating <= 2, false)
  ) then
    return new;
  end if;

  select concat_ws(' ',first_name,last_name) into student_name
  from public.students where id=new.student_id and school_id=new.school_id;

  event_kind := case
    when new.session_type in ('near_revision','distant_revision') then 'revision_needs_follow_up'
    else 'memorization_needs_follow_up'
  end;
  title_text := case when event_kind='revision_needs_follow_up' then 'تحتاج المراجعة إلى متابعة' else 'الحفظ يحتاج إلى متابعة' end;
  body_text := coalesce(student_name,'طالب') || ' — سورة رقم ' || new.surah_number::text ||
    '، الآيات ' || new.ayah_start::text || '-' || new.ayah_end::text ||
    '. نتيجة الجلسة: ' || coalesce(new.recitation_result,'أداء يحتاج إلى متابعة') || '.';
  perform public.emit_learning_follow_up_alert(
    new.school_id,new.student_id,new.branch_id,new.class_id,
    'learning_record',new.id,event_kind,title_text,body_text,'/academic-reports'
  );
  return new;
end;
$$;

create trigger memorization_record_learning_follow_up_alert
after insert on public.memorization_records
for each row execute function public.notify_learning_record_follow_up();

create or replace function public.notify_attendance_follow_up()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  student_name text;
begin
  if new.status <> 'absent' or (tg_op='UPDATE' and old.status='absent') then
    return new;
  end if;
  select concat_ws(' ',first_name,last_name) into student_name
  from public.students where id=new.student_id and school_id=new.school_id;
  perform public.emit_learning_follow_up_alert(
    new.school_id,new.student_id,new.branch_id,new.class_id,
    'attendance_record',new.id,'absence_needs_follow_up',
    'تنبيه غياب',coalesce(student_name,'طالب') || ' مسجل غائبًا في حصة ' ||
      to_char((select session_date from public.attendance_sessions where id=new.session_id),'YYYY-MM-DD') || '.',
    '/attendance'
  );
  return new;
end;
$$;

create trigger attendance_learning_follow_up_alert
after insert or update of status on public.attendance_records
for each row execute function public.notify_attendance_follow_up();

revoke all on function public.notify_learning_record_follow_up() from public, anon, authenticated;
revoke all on function public.notify_attendance_follow_up() from public, anon, authenticated;

commit;
