-- Quran School SaaS - memorization follow-up analytics
-- V2 review migration only. Do not apply to Production manually.
-- Derives read-only analytics from memorization follow-up observations and audit history.
-- No persisted counters or analytics tables are introduced.

begin;

create or replace function public.get_memorization_follow_up_analytics(
  target_school_id uuid,
  target_branch_id uuid default null,
  target_class_id uuid default null,
  target_student_id uuid default null,
  target_date_from date default (current_date - 29),
  target_date_to date default current_date,
  target_category text default null,
  target_status text default null,
  target_priority integer default null,
  target_limit integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  analytics jsonb;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'MEMORIZATION_FOLLOW_UP_ANALYTICS_AUTH_REQUIRED';
  end if;

  if target_date_from is null or target_date_to is null or target_date_from > target_date_to or (target_date_to - target_date_from) > 366 then
    raise exception using errcode = '22023', message = 'MEMORIZATION_FOLLOW_UP_ANALYTICS_DATE_RANGE_INVALID';
  end if;
  if target_limit is null or target_limit not between 1 and 50 then
    raise exception using errcode = '22023', message = 'MEMORIZATION_FOLLOW_UP_ANALYTICS_LIMIT_INVALID';
  end if;
  if target_category is not null and target_category not in ('memorization_error','revision_weakness','tajweed','hesitation','forgetting','recurring_error','other') then
    raise exception using errcode = '22023', message = 'MEMORIZATION_FOLLOW_UP_ANALYTICS_CATEGORY_INVALID';
  end if;
  if target_status is not null and target_status not in ('open','improved','resolved') then
    raise exception using errcode = '22023', message = 'MEMORIZATION_FOLLOW_UP_ANALYTICS_STATUS_INVALID';
  end if;
  if target_priority is not null and target_priority not between 1 and 3 then
    raise exception using errcode = '22023', message = 'MEMORIZATION_FOLLOW_UP_ANALYTICS_PRIORITY_INVALID';
  end if;

  if not exists (
    select 1 from public.classes as target_class
    where target_class.school_id = target_school_id
      and target_class.status = 'active'
      and (target_branch_id is null or target_class.branch_id = target_branch_id)
      and (target_class_id is null or target_class.id = target_class_id)
      and (
        public.can_access_memorization_class(target_school_id,target_class.branch_id,target_class.id,'memorization.view')
        or public.can_access_memorization_class(target_school_id,target_class.branch_id,target_class.id,'memorization.manage')
      )
  ) then
    raise exception using errcode = '42501', message = 'MEMORIZATION_FOLLOW_UP_ANALYTICS_VIEW_REQUIRED';
  end if;

  if target_student_id is not null and not exists (
    select 1 from public.students as student
    where student.id = target_student_id
      and student.school_id = target_school_id
      and student.status = 'active'
      and (target_branch_id is null or student.branch_id = target_branch_id)
      and (target_class_id is null or student.class_id = target_class_id)
      and (
        public.can_access_memorization_class(target_school_id,student.branch_id,student.class_id,'memorization.view')
        or public.can_access_memorization_class(target_school_id,student.branch_id,student.class_id,'memorization.manage')
      )
  ) then
    raise exception using errcode = '42501', message = 'MEMORIZATION_FOLLOW_UP_ANALYTICS_SCOPE_DENIED';
  end if;

  with scoped_students as (
    select student.id, student.branch_id, student.class_id,
      btrim(concat_ws(' ',student.first_name,student.last_name))::text as student_name,
      target_class.name::text as class_name
    from public.students as student
    join public.classes as target_class
      on target_class.school_id = student.school_id
     and target_class.branch_id = student.branch_id
     and target_class.id = student.class_id
     and target_class.status = 'active'
    where student.school_id = target_school_id
      and student.status = 'active'
      and (target_branch_id is null or student.branch_id = target_branch_id)
      and (target_class_id is null or student.class_id = target_class_id)
      and (target_student_id is null or student.id = target_student_id)
      and (
        public.can_access_memorization_class(target_school_id,student.branch_id,student.class_id,'memorization.view')
        or public.can_access_memorization_class(target_school_id,student.branch_id,student.class_id,'memorization.manage')
      )
  ),
  filtered_notes as (
    select note.*, scoped_student.branch_id as current_branch_id, scoped_student.class_id as current_class_id,
      scoped_student.student_name, scoped_student.class_name
    from public.memorization_follow_up_notes as note
    join scoped_students as scoped_student on scoped_student.id = note.student_id
    where note.school_id = target_school_id
      and note.observed_on between target_date_from and target_date_to
      and (target_category is null or note.category = target_category)
      and (target_status is null or note.status = target_status)
      and (target_priority is null or note.priority = target_priority)
  ),
  signature_counts as (
    select note.student_id,note.category,note.surah_number,note.ayah_start,note.ayah_end,
      count(*)::bigint as recurrence_count
    from filtered_notes as note
    group by note.student_id,note.category,note.surah_number,note.ayah_start,note.ayah_end
  ),
  category_rows as (
    select note.category,count(*)::bigint as observation_count,
      count(*) filter (where note.status <> 'resolved')::bigint as unresolved_count,
      count(distinct note.student_id)::bigint as student_count
    from filtered_notes as note group by note.category
  ),
  location_rows as (
    select note.surah_number,note.ayah_start,note.ayah_end,count(*)::bigint as observation_count,
      count(*) filter (where note.status <> 'resolved')::bigint as unresolved_count,
      count(distinct note.student_id)::bigint as student_count
    from filtered_notes as note group by note.surah_number,note.ayah_start,note.ayah_end
  ),
  student_rows as (
    select scoped_student.id as student_id,scoped_student.student_name,scoped_student.branch_id,
      scoped_student.class_id,scoped_student.class_name,count(note.id)::bigint as observation_count,
      count(note.id) filter (where note.status <> 'resolved')::bigint as unresolved_count,
      count(note.id) filter (where note.priority = 1 and note.status <> 'resolved')::bigint as high_priority_unresolved_count,
      coalesce((select count(*)::bigint from signature_counts as signature
        where signature.student_id = scoped_student.id and signature.recurrence_count > 1),0::bigint) as recurring_signature_count
    from scoped_students as scoped_student
    left join filtered_notes as note on note.student_id = scoped_student.id
    group by scoped_student.id,scoped_student.student_name,scoped_student.branch_id,scoped_student.class_id,scoped_student.class_name
  ),
  trend_rows as (
    select history.changed_at::date as event_date,
      count(*) filter (where history.operation = 'status_update' and history.new_values ->> 'status' = 'improved')::bigint as improved_events,
      count(*) filter (where history.operation = 'status_update' and history.new_values ->> 'status' = 'resolved')::bigint as resolved_events,
      count(*) filter (where history.operation = 'status_update' and history.new_values ->> 'status' = 'open')::bigint as reopened_events
    from public.memorization_follow_up_note_history as history
    join filtered_notes as note on note.id = history.follow_up_note_id and note.school_id = history.school_id
    where history.changed_at::date between target_date_from and target_date_to and history.operation = 'status_update'
    group by history.changed_at::date
  ),
  recent_high_priority_rows as (
    select note.id,note.student_id,note.student_name,note.current_branch_id as branch_id,
      note.current_class_id as class_id,note.class_name,note.category,note.status,note.priority,note.surah_number,
      note.ayah_start,note.ayah_end,note.note_text,note.observed_on,signature.recurrence_count
    from filtered_notes as note
    join signature_counts as signature
      on signature.student_id = note.student_id and signature.category = note.category
     and signature.surah_number = note.surah_number and signature.ayah_start = note.ayah_start and signature.ayah_end = note.ayah_end
    where note.priority = 1 and note.status <> 'resolved'
    order by signature.recurrence_count desc,note.observed_on desc,note.created_at desc,note.id desc
    limit target_limit
  )
  select jsonb_build_object(
    'overview',jsonb_build_object(
      'observation_count',(select count(*)::bigint from filtered_notes),
      'student_count',(select count(distinct note.student_id)::bigint from filtered_notes as note),
      'open_count',(select count(*)::bigint from filtered_notes as note where note.status = 'open'),
      'improved_count',(select count(*)::bigint from filtered_notes as note where note.status = 'improved'),
      'resolved_count',(select count(*)::bigint from filtered_notes as note where note.status = 'resolved'),
      'high_priority_unresolved_count',(select count(*)::bigint from filtered_notes as note where note.priority = 1 and note.status <> 'resolved'),
      'recurring_signature_count',(select count(*)::bigint from signature_counts as signature where signature.recurrence_count > 1)
    ),
    'categories',coalesce((select jsonb_agg(to_jsonb(category_row) order by category_row.observation_count desc,category_row.unresolved_count desc,category_row.category) from category_rows as category_row),'[]'::jsonb),
    'locations',coalesce((select jsonb_agg(to_jsonb(location_row) order by location_row.observation_count desc,location_row.unresolved_count desc,location_row.surah_number,location_row.ayah_start,location_row.ayah_end)
      from (select * from location_rows order by observation_count desc,unresolved_count desc,surah_number,ayah_start,ayah_end limit target_limit) as location_row),'[]'::jsonb),
    'students',coalesce((select jsonb_agg(to_jsonb(student_row) order by student_row.unresolved_count desc,student_row.recurring_signature_count desc,student_row.high_priority_unresolved_count desc,student_row.student_name)
      from (select * from student_rows where observation_count > 0 order by unresolved_count desc,recurring_signature_count desc,high_priority_unresolved_count desc,student_name limit target_limit) as student_row),'[]'::jsonb),
    'trend',coalesce((select jsonb_agg(to_jsonb(trend_row) order by trend_row.event_date) from trend_rows as trend_row),'[]'::jsonb),
    'recent_high_priority',coalesce((select jsonb_agg(to_jsonb(recent_row)) from recent_high_priority_rows as recent_row),'[]'::jsonb)
  ) into analytics;

  return coalesce(analytics,jsonb_build_object(
    'overview',jsonb_build_object('observation_count',0,'student_count',0,'open_count',0,'improved_count',0,'resolved_count',0,'high_priority_unresolved_count',0,'recurring_signature_count',0),
    'categories','[]'::jsonb,'locations','[]'::jsonb,'students','[]'::jsonb,'trend','[]'::jsonb,'recent_high_priority','[]'::jsonb
  ));
end;
$$;

comment on function public.get_memorization_follow_up_analytics(uuid,uuid,uuid,uuid,date,date,text,text,integer,integer) is
  'Read-only scoped analytics derived from memorization follow-up observations and status audit history. Uses each student current active class for authorization and preserves historical note continuity after transfer.';
revoke all on function public.get_memorization_follow_up_analytics(uuid,uuid,uuid,uuid,date,date,text,text,integer,integer) from public;
revoke execute on function public.get_memorization_follow_up_analytics(uuid,uuid,uuid,uuid,date,date,text,text,integer,integer) from anon;
grant execute on function public.get_memorization_follow_up_analytics(uuid,uuid,uuid,uuid,date,date,text,text,integer,integer) to authenticated;

commit;
