-- Quran School SaaS - structured memorization session outcomes
-- Adds explicit session result and recitation accuracy while preserving legacy rows.

begin;

alter table public.memorization_records
  add column recitation_result text,
  add column recitation_accuracy text,
  add column focus_words text;

alter table public.memorization_records
  add constraint memorization_records_recitation_result_check
    check (
      recitation_result is null
      or recitation_result in (
        'memorized',
        'not_memorized',
        'revised',
        'not_revised'
      )
    ),
  add constraint memorization_records_recitation_accuracy_check
    check (
      recitation_accuracy is null
      or recitation_accuracy in (
        'no_errors',
        'focus_words',
        'repeated_errors',
        'needs_repetition'
      )
    ),
  add constraint memorization_records_focus_words_check
    check (
      (recitation_accuracy = 'focus_words'
        and focus_words is not null
        and char_length(btrim(focus_words)) between 1 and 500)
      or
      (recitation_accuracy is distinct from 'focus_words'
        and focus_words is null)
    );

comment on column public.memorization_records.recitation_result is
  'Structured outcome: memorized/not_memorized for new memorization, revised/not_revised for revision sessions. NULL is retained for legacy records.';
comment on column public.memorization_records.recitation_accuracy is
  'Recitation accuracy: no_errors, focus_words, repeated_errors, or needs_repetition. NULL is retained for legacy records.';
comment on column public.memorization_records.focus_words is
  'Specific words or phrases the student should focus on when recitation_accuracy is focus_words.';

grant insert (recitation_result, recitation_accuracy, focus_words)
  on public.memorization_records to authenticated;
grant update (recitation_result, recitation_accuracy, focus_words)
  on public.memorization_records to authenticated;

create or replace function public.audit_memorization_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.memorization_record_history (
      memorization_record_id,
      school_id,
      branch_id,
      class_id,
      student_id,
      teacher_id,
      operation,
      old_values,
      new_values,
      changed_by
    ) values (
      new.id,
      new.school_id,
      new.branch_id,
      new.class_id,
      new.student_id,
      new.teacher_id,
      'insert',
      null,
      jsonb_build_object(
        'record_date', new.record_date,
        'session_type', new.session_type,
        'surah_number', new.surah_number,
        'ayah_start', new.ayah_start,
        'ayah_end', new.ayah_end,
        'rating', new.rating,
        'errors_count', new.errors_count,
        'recitation_result', new.recitation_result,
        'recitation_accuracy', new.recitation_accuracy,
        'focus_words', new.focus_words,
        'notes', new.notes,
        'next_assignment', new.next_assignment
      ),
      new.recorded_by
    );
  elsif row(
      new.record_date,
      new.session_type,
      new.surah_number,
      new.ayah_start,
      new.ayah_end,
      new.rating,
      new.errors_count,
      new.recitation_result,
      new.recitation_accuracy,
      new.focus_words,
      new.notes,
      new.next_assignment
    ) is distinct from row(
      old.record_date,
      old.session_type,
      old.surah_number,
      old.ayah_start,
      old.ayah_end,
      old.rating,
      old.errors_count,
      old.recitation_result,
      old.recitation_accuracy,
      old.focus_words,
      old.notes,
      old.next_assignment
    )
  then
    insert into public.memorization_record_history (
      memorization_record_id,
      school_id,
      branch_id,
      class_id,
      student_id,
      teacher_id,
      operation,
      old_values,
      new_values,
      changed_by
    ) values (
      new.id,
      new.school_id,
      new.branch_id,
      new.class_id,
      new.student_id,
      new.teacher_id,
      'update',
      jsonb_build_object(
        'record_date', old.record_date,
        'session_type', old.session_type,
        'surah_number', old.surah_number,
        'ayah_start', old.ayah_start,
        'ayah_end', old.ayah_end,
        'rating', old.rating,
        'errors_count', old.errors_count,
        'recitation_result', old.recitation_result,
        'recitation_accuracy', old.recitation_accuracy,
        'focus_words', old.focus_words,
        'notes', old.notes,
        'next_assignment', old.next_assignment
      ),
      jsonb_build_object(
        'record_date', new.record_date,
        'session_type', new.session_type,
        'surah_number', new.surah_number,
        'ayah_start', new.ayah_start,
        'ayah_end', new.ayah_end,
        'rating', new.rating,
        'errors_count', new.errors_count,
        'recitation_result', new.recitation_result,
        'recitation_accuracy', new.recitation_accuracy,
        'focus_words', new.focus_words,
        'notes', new.notes,
        'next_assignment', new.next_assignment
      ),
      new.last_modified_by
    );
  end if;

  return new;
end;
$$;

revoke all on function public.audit_memorization_record() from public;
revoke execute on function public.audit_memorization_record() from anon, authenticated;

drop function public.list_my_guardian_student_memorization(uuid, uuid, integer);

create function public.list_my_guardian_student_memorization(
  target_school_id uuid,
  target_student_id uuid,
  target_limit integer default 20
)
returns table (
  memorization_record_id uuid,
  record_date date,
  session_type text,
  surah_number smallint,
  ayah_start smallint,
  ayah_end smallint,
  rating smallint,
  errors_count smallint,
  recitation_result text,
  recitation_accuracy text,
  focus_words text,
  next_assignment text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if target_limit is null or target_limit < 1 or target_limit > 100 then
    raise exception using errcode = '22023', message = 'invalid memorization limit';
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
    record.id,
    record.record_date,
    record.session_type,
    record.surah_number,
    record.ayah_start,
    record.ayah_end,
    record.rating,
    record.errors_count,
    record.recitation_result,
    record.recitation_accuracy,
    record.focus_words,
    record.next_assignment
  from public.memorization_records as record
  where record.school_id = target_school_id
    and record.student_id = target_student_id
  order by record.record_date desc, record.created_at desc, record.id desc
  limit target_limit;
end;
$$;

revoke all on function public.list_my_guardian_student_memorization(uuid, uuid, integer)
from public, anon;
grant execute on function public.list_my_guardian_student_memorization(uuid, uuid, integer)
to authenticated;

commit;
