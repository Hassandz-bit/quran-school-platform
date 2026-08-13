-- QuranOS V2 - private temporary artifacts for school backup downloads
-- This bucket is only a short-lived delivery channel. It is not the off-site disaster-recovery copy.

begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'school-backup-downloads',
  'school-backup-downloads',
  false,
  104857600,
  array['application/json']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Browser users receive only short-lived signed URLs created by the server-side
-- backup function. No direct bucket policy is granted to anon/authenticated.

commit;
