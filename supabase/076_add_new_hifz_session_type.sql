-- Add a distinct "new hifz" session without changing existing session identifiers.
-- Legacy memorization records and recitation-accuracy columns remain intact.

begin;

alter table public.memorization_records
  drop constraint memorization_records_session_type_check,
  add constraint memorization_records_session_type_check
    check (
      session_type in (
        'new_memorization',
        'new_hifz',
        'near_revision',
        'distant_revision',
        'assessment'
      )
    );

alter table public.memorization_records
  drop constraint memorization_records_session_result_matches_type_check,
  add constraint memorization_records_session_result_matches_type_check
    check (
      recitation_result is null
      or (
        session_type in ('new_memorization', 'new_hifz', 'assessment')
        and recitation_result in ('memorized', 'not_memorized')
      )
      or (
        session_type in ('near_revision', 'distant_revision')
        and recitation_result in ('revised', 'not_revised')
      )
    );

comment on column public.memorization_records.session_type is
  'One of new_memorization (التسميع الجديد), new_hifz (حفظ الجديد), near_revision, distant_revision, or assessment.';

commit;
