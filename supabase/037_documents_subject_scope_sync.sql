-- QuranOS V2 - keep document authorization scope aligned with subject lifecycle.
-- Student documents must move with the student when an authorized transfer
-- changes branch_id; otherwise the old branch could retain document visibility.

begin;

create or replace function public.sync_student_document_branch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.school_id is distinct from old.school_id then
    raise exception using errcode = '22023', message = 'document_subject_school_change_unsupported';
  end if;

  if new.branch_id is distinct from old.branch_id then
    update public.document_records
    set branch_id = new.branch_id,
        updated_by = coalesce((select auth.uid()), updated_by)
    where school_id = new.school_id
      and subject_type = 'student'
      and student_id = new.id
      and branch_id is distinct from new.branch_id;
  end if;

  return new;
end;
$$;

drop trigger if exists students_sync_document_branch on public.students;
create trigger students_sync_document_branch
after update of school_id, branch_id on public.students
for each row execute function public.sync_student_document_branch();

-- Standard categories are single-slot. "Other" supports multiple distinct
-- labels while still remaining idempotent for the same custom label.
drop index if exists public.document_records_current_student_category_idx;
drop index if exists public.document_records_current_lead_category_idx;

create unique index document_records_student_standard_category_idx
  on public.document_records (school_id, student_id, category)
  where subject_type = 'student' and category <> 'other';
create unique index document_records_student_other_label_idx
  on public.document_records (school_id, student_id, lower(btrim(custom_label)))
  where subject_type = 'student' and category = 'other';

create unique index document_records_lead_standard_category_idx
  on public.document_records (school_id, registration_lead_id, category)
  where subject_type = 'registration_lead' and category <> 'other';
create unique index document_records_lead_other_label_idx
  on public.document_records (school_id, registration_lead_id, lower(btrim(custom_label)))
  where subject_type = 'registration_lead' and category = 'other';

create or replace function public.create_document_slot(
  target_school_id uuid,
  target_subject_type text,
  target_subject_id uuid,
  target_category text,
  target_custom_label text default null,
  target_notes text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_branch_id uuid;
  normalized_custom_label text := nullif(btrim(target_custom_label), '');
  normalized_notes text := nullif(btrim(target_notes), '');
  new_document_id uuid;
begin
  if actor_id is null or not public.current_profile_is_active() then
    raise exception using errcode = '42501', message = 'documents_unauthorized';
  end if;

  if target_school_id is null
     or target_subject_id is null
     or target_subject_type not in ('student', 'registration_lead')
     or target_category not in (
       'birth_certificate', 'personal_photos', 'medical_report', 'previous_certificate',
       'guardian_identity', 'registration_form', 'other'
     )
     or (target_category = 'other' and (normalized_custom_label is null or char_length(normalized_custom_label) not between 2 and 120))
     or (target_category <> 'other' and normalized_custom_label is not null)
     or (normalized_notes is not null and char_length(normalized_notes) > 2000) then
    raise exception using errcode = '22023', message = 'documents_invalid_input';
  end if;

  if target_subject_type = 'student' then
    select student.branch_id into target_branch_id
    from public.students as student
    where student.id = target_subject_id and student.school_id = target_school_id;
  else
    select lead.branch_id into target_branch_id
    from public.registration_leads as lead
    where lead.id = target_subject_id and lead.school_id = target_school_id;
  end if;

  if target_branch_id is null
     or not exists (
       select 1 from public.branches as branch
       where branch.school_id = target_school_id
         and branch.id = target_branch_id
         and branch.status = 'active'
     )
     or not public.has_branch_permission(target_school_id, target_branch_id, 'documents.manage') then
    raise exception using errcode = '42501', message = 'documents_unauthorized';
  end if;

  insert into public.document_records (
    school_id, branch_id, subject_type, student_id, registration_lead_id,
    category, custom_label, status, notes, created_by, updated_by
  ) values (
    target_school_id,
    target_branch_id,
    target_subject_type,
    case when target_subject_type = 'student' then target_subject_id else null end,
    case when target_subject_type = 'registration_lead' then target_subject_id else null end,
    target_category,
    normalized_custom_label,
    'missing',
    normalized_notes,
    actor_id,
    actor_id
  )
  on conflict do nothing
  returning id into new_document_id;

  if new_document_id is null then
    select document.id into new_document_id
    from public.document_records as document
    where document.school_id = target_school_id
      and document.subject_type = target_subject_type
      and document.category = target_category
      and (
        (target_subject_type = 'student' and document.student_id = target_subject_id)
        or
        (target_subject_type = 'registration_lead' and document.registration_lead_id = target_subject_id)
      )
      and (
        target_category <> 'other'
        or lower(btrim(document.custom_label)) = lower(normalized_custom_label)
      );
  else
    insert into public.document_events (
      document_id, school_id, branch_id, event_type, previous_status, new_status, actor_id
    ) values (
      new_document_id, target_school_id, target_branch_id, 'slot_created', null, 'missing', actor_id
    );
  end if;

  return new_document_id;
end;
$$;

revoke all on function public.create_document_slot(uuid, text, uuid, text, text, text) from public, anon;
grant execute on function public.create_document_slot(uuid, text, uuid, text, text, text) to authenticated;

commit;
