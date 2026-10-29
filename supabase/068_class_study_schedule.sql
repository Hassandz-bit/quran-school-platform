-- Structured class study days and times for Quran school scheduling.
-- Existing schedule_label values are preserved for backward compatibility.
begin;
alter table public.classes
  add column if not exists study_days text[] not null default '{}',
  add column if not exists start_time time,
  add column if not exists end_time time;
alter table public.classes drop constraint if exists classes_study_days_valid_check;
alter table public.classes add constraint classes_study_days_valid_check
  check (study_days <@ array['sunday','monday','tuesday','wednesday','thursday','friday','saturday']::text[]);
alter table public.classes drop constraint if exists classes_study_time_pair_check;
alter table public.classes add constraint classes_study_time_pair_check
  check ((start_time is null and end_time is null) or (start_time is not null and end_time is not null and start_time < end_time));
create index if not exists classes_school_branch_study_schedule_idx
  on public.classes (school_id, branch_id, start_time, end_time) where status <> 'archived';
comment on column public.classes.study_days is 'Configured weekly study days; weekday keys are locale-independent.';
comment on column public.classes.start_time is 'Local start time for the class study schedule.';
comment on column public.classes.end_time is 'Local end time for the class study schedule.';
commit;
