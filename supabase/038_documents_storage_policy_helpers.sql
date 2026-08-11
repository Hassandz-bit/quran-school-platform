-- QuranOS V2 - Storage RLS helpers for private document metadata.
-- storage.objects policies must not query document_records as the browser role,
-- because document metadata intentionally has no direct authenticated SELECT.

begin;

create or replace function public.can_read_document_storage_object(target_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.document_records as document
    where target_object_name is not null
      and document.school_id::text = (storage.foldername(target_object_name))[1]
      and document.subject_type = (storage.foldername(target_object_name))[2]
      and coalesce(document.student_id, document.registration_lead_id)::text = (storage.foldername(target_object_name))[3]
      and document.id::text = (storage.foldername(target_object_name))[4]
      and (
        public.has_branch_permission(document.school_id, document.branch_id, 'documents.view')
        or public.has_branch_permission(document.school_id, document.branch_id, 'documents.manage')
      )
  );
$$;

create or replace function public.can_manage_document_storage_object(
  target_object_name text,
  require_stale boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.document_records as document
    join public.branches as branch
      on branch.school_id = document.school_id
     and branch.id = document.branch_id
    where target_object_name is not null
      and branch.status = 'active'
      and document.school_id::text = (storage.foldername(target_object_name))[1]
      and document.subject_type = (storage.foldername(target_object_name))[2]
      and coalesce(document.student_id, document.registration_lead_id)::text = (storage.foldername(target_object_name))[3]
      and document.id::text = (storage.foldername(target_object_name))[4]
      and (not require_stale or document.object_path is distinct from target_object_name)
      and public.has_branch_permission(document.school_id, document.branch_id, 'documents.manage')
  );
$$;

revoke all on function public.can_read_document_storage_object(text) from public, anon;
revoke all on function public.can_manage_document_storage_object(text, boolean) from public, anon;
grant execute on function public.can_read_document_storage_object(text) to authenticated;
grant execute on function public.can_manage_document_storage_object(text, boolean) to authenticated;

do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  execute 'drop policy if exists "school documents scoped read" on storage.objects';
  execute 'drop policy if exists "school documents scoped insert" on storage.objects';
  execute 'drop policy if exists "school documents scoped update" on storage.objects';
  execute 'drop policy if exists "school documents scoped delete" on storage.objects';

  execute $policy$
    create policy "school documents scoped read"
    on storage.objects for select to authenticated
    using (
      bucket_id = 'school-documents'
      and public.can_read_document_storage_object(name)
    )
  $policy$;

  execute $policy$
    create policy "school documents scoped insert"
    on storage.objects for insert to authenticated
    with check (
      bucket_id = 'school-documents'
      and public.can_manage_document_storage_object(name, false)
    )
  $policy$;

  -- No UPDATE policy: current bytes are immutable from browser roles.
  execute $policy$
    create policy "school documents scoped delete"
    on storage.objects for delete to authenticated
    using (
      bucket_id = 'school-documents'
      and public.can_manage_document_storage_object(name, true)
    )
  $policy$;
end
$$;

commit;
