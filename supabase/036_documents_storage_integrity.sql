-- QuranOS V2 - document storage integrity hardening
-- A document cannot claim a file that does not exist, current file bytes cannot
-- be deleted behind metadata, and in-place object overwrites are not allowed.

begin;

create or replace function public.validate_document_storage_object()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.object_path is not null
     and to_regclass('storage.objects') is not null
     and not exists (
       select 1
       from storage.objects as object
       where object.bucket_id = 'school-documents'
         and object.name = new.object_path
     ) then
    raise exception using errcode = '23503', message = 'document_storage_object_missing';
  end if;

  return new;
end;
$$;

drop trigger if exists document_records_validate_storage_object on public.document_records;
create trigger document_records_validate_storage_object
before insert or update of object_path, status
on public.document_records
for each row execute function public.validate_document_storage_object();

do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  -- QuranOS always replaces a document by uploading a fresh immutable object.
  -- No browser role needs to overwrite bytes at an existing path.
  execute 'drop policy if exists "school documents scoped update" on storage.objects';

  -- A current file cannot be removed while metadata points to it. After a
  -- successful replacement, only the previous stale path becomes removable.
  execute 'drop policy if exists "school documents scoped delete" on storage.objects';
  execute $policy$
    create policy "school documents scoped delete"
    on storage.objects for delete to authenticated
    using (
      bucket_id = 'school-documents'
      and exists (
        select 1
        from public.document_records as document
        join public.branches as branch
          on branch.school_id = document.school_id and branch.id = document.branch_id
        where branch.status = 'active'
          and document.school_id::text = (storage.foldername(name))[1]
          and document.subject_type = (storage.foldername(name))[2]
          and coalesce(document.student_id, document.registration_lead_id)::text = (storage.foldername(name))[3]
          and document.id::text = (storage.foldername(name))[4]
          and document.object_path is distinct from name
          and public.has_branch_permission(document.school_id, document.branch_id, 'documents.manage')
      )
    )
  $policy$;
end
$$;

commit;
