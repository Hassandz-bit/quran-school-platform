\set ON_ERROR_STOP on

create or replace function public.test_follow_up_transfer_assert(
  condition boolean,
  message text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if condition is not true then
    raise exception '%', message;
  end if;
end;
$$;

-- Add a second active class in the same branch and assign the second teacher to it.
insert into public.classes (id, school_id, branch_id, name, status) values (
  '21000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'Class Three',
  'active'
);

insert into public.class_teachers (
  id,
  school_id,
  branch_id,
  class_id,
  teacher_id,
  status
) values (
  '60000000-0000-4000-8000-000000000006',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000003',
  '50000000-0000-4000-8000-000000000005',
  'active'
);

-- Capture the latest hesitation observation that was created in the original class.
select note.id as transferred_note_id
from public.memorization_follow_up_notes as note
where note.student_id = '70000000-0000-4000-8000-000000000001'
  and note.category = 'hesitation'
  and note.surah_number = 2
  and note.ayah_start = 10
  and note.ayah_end = 12
order by note.observed_on desc, note.created_at desc, note.id desc
limit 1
\gset

select public.test_follow_up_transfer_assert(
  :'transferred_note_id'::uuid is not null,
  'expected a historical hesitation note before transfer'
);

-- Transfer the student as an administrative data change. Historical note scope stays immutable.
update public.students
set class_id = '21000000-0000-4000-8000-000000000003'
where id = '70000000-0000-4000-8000-000000000001';

select public.test_follow_up_transfer_assert(
  (
    select class_id = '21000000-0000-4000-8000-000000000003'::uuid
    from public.students
    where id = '70000000-0000-4000-8000-000000000001'
  ),
  'student transfer fixture did not move to the new class'
);

-- The old teacher still has permission on the old class, but the student is no longer there.
-- Reads must be denied by current student scope.
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-4000-8000-000000000001',
  false
);

do $$
begin
  begin
    perform public.list_memorization_follow_up_history(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000001',
      100
    );
    raise exception 'old teacher read transferred student history from the former class';
  exception
    when insufficient_privilege then
      if sqlerrm <> 'MEMORIZATION_FOLLOW_UP_STUDENT_SCOPE_DENIED' then
        raise exception 'unexpected former-class read denial: %', sqlerrm;
      end if;
  end;
end;
$$;

-- A known historical note and a random UUID outside current scope must be indistinguishable:
-- both return false rather than revealing that the known note exists.
select public.test_follow_up_transfer_assert(
  public.set_memorization_follow_up_note_status(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001',
    :'transferred_note_id'::uuid,
    'resolved'
  ) = false,
  'former teacher should receive false for a transferred-student historical note'
);

select public.test_follow_up_transfer_assert(
  public.set_memorization_follow_up_note_status(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001',
    '99999999-0000-4000-8000-000000000999',
    'resolved'
  ) = false,
  'former teacher should receive the same false result for a nonexistent note'
);
reset role;

-- The newly assigned teacher can see the student's historical observations through the new
-- current class scope even though the note rows retain their original class provenance.
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-4000-8000-000000000005',
  false
);

select public.test_follow_up_transfer_assert(
  (
    select count(*) >= 4
    from public.list_memorization_follow_up_history(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000003',
      '70000000-0000-4000-8000-000000000001',
      100
    ) as result
  ),
  'new teacher should retain access to historical follow-up notes after class transfer'
);

select public.test_follow_up_transfer_assert(
  public.set_memorization_follow_up_note_status(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000003',
    :'transferred_note_id'::uuid,
    'resolved'
  ),
  'new teacher should be able to resolve a historical note through current class scope'
);

-- A recurrence in the new class must continue the same student's historical recurrence count.
select public.create_memorization_follow_up_note(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000003',
  '70000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000005',
  null,
  'hesitation',
  1,
  2,
  10,
  12,
  'تكرر التردد بعد انتقال الطالب إلى الحلقة الجديدة',
  current_date + 2
) as transferred_recurrence_id
\gset

select public.test_follow_up_transfer_assert(
  (
    select count(*) = 1
      and bool_and(result.id = :'transferred_recurrence_id'::uuid)
      and max(result.recurrence_count) = 4
      and bool_and(result.status = 'open')
    from public.list_memorization_focus_notes(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000003',
      '70000000-0000-4000-8000-000000000001',
      20
    ) as result
    where result.category = 'hesitation'
      and result.surah_number = 2
      and result.ayah_start = 10
      and result.ayah_end = 12
  ),
  'recurrence count should continue across a same-school class transfer'
);
reset role;

select public.test_follow_up_transfer_assert(
  (
    select class_id = '21000000-0000-4000-8000-000000000001'::uuid
    from public.memorization_follow_up_notes
    where id = :'transferred_note_id'::uuid
  ),
  'historical note provenance must remain on the original class after student transfer'
);

select public.test_follow_up_transfer_assert(
  (
    select class_id = '21000000-0000-4000-8000-000000000003'::uuid
    from public.memorization_follow_up_notes
    where id = :'transferred_recurrence_id'::uuid
  ),
  'new recurrence must record the student current class as its provenance'
);

drop function public.test_follow_up_transfer_assert(boolean, text);
