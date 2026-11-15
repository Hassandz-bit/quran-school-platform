-- Keep the school track focused on one general average per student and term.
begin;

create unique index if not exists school_track_general_average_unique_idx
  on public.school_track_results (school_id, student_id, academic_year, term)
  where subject = 'المعدل العام';

create or replace function public.validate_school_track_general_average()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.subject = 'المعدل العام' then
    if new.assessment_title <> 'المعدل العام للفصل'
      or new.assessment_type <> 'exam'
      or new.max_score <> 20
      or new.term not in ('الفصل الأول', 'الفصل الثاني', 'الفصل الثالث') then
      raise exception 'school_track_general_average_invalid' using errcode = '23514';
    end if;
  elsif tg_op = 'INSERT' then
    raise exception 'school_track_general_average_only' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger school_track_general_average_guard
before insert or update on public.school_track_results
for each row execute function public.validate_school_track_general_average();

comment on index public.school_track_general_average_unique_idx is
  'One general average per student, academic year, and term; historical subject-level rows remain untouched.';

commit;
