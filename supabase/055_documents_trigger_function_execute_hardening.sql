-- QuranOS V2 - document trigger function execute hardening
-- Trigger helpers are internal database machinery, not browser-callable RPCs.
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default, so remove
-- that inherited privilege explicitly while leaving the triggers themselves intact.

begin;

revoke all on function public.validate_document_subject_scope()
from public, anon, authenticated;

revoke all on function public.validate_document_storage_object()
from public, anon, authenticated;

revoke all on function public.sync_student_document_branch()
from public, anon, authenticated;

comment on function public.validate_document_subject_scope() is
  'Internal document subject-scope trigger helper; no browser EXECUTE privilege.';
comment on function public.validate_document_storage_object() is
  'Internal document storage-integrity trigger helper; no browser EXECUTE privilege.';
comment on function public.sync_student_document_branch() is
  'Internal student/document branch-sync trigger helper; no browser EXECUTE privilege.';

commit;
