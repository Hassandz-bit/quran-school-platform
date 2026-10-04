\set ON_ERROR_STOP on

do $$
declare
  missing_columns text[];
  bucket_is_public boolean;
  bucket_limit bigint;
  bucket_mimes text[];
begin
  select array_agg(required.column_name order by required.column_name)
  into missing_columns
  from unnest(array[
    'contact_phone',
    'contact_email',
    'address',
    'website_url',
    'logo_path'
  ]) as required(column_name)
  where not exists (
    select 1
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'schools'
      and column_info.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'institution settings columns are missing: %', missing_columns;
  end if;

  if not has_column_privilege('authenticated', 'public.schools', 'contact_phone', 'UPDATE')
    or not has_column_privilege('authenticated', 'public.schools', 'contact_email', 'UPDATE')
    or not has_column_privilege('authenticated', 'public.schools', 'address', 'UPDATE')
    or not has_column_privilege('authenticated', 'public.schools', 'website_url', 'UPDATE')
    or not has_column_privilege('authenticated', 'public.schools', 'logo_path', 'UPDATE') then
    raise exception 'authenticated does not have the intended school settings column grants';
  end if;

  select bucket.public, bucket.file_size_limit, bucket.allowed_mime_types
  into bucket_is_public, bucket_limit, bucket_mimes
  from storage.buckets as bucket
  where bucket.id = 'school-logos';

  if bucket_is_public is distinct from true
    or bucket_limit is distinct from 1048576
    or bucket_mimes is distinct from array['image/png', 'image/jpeg', 'image/webp']::text[] then
    raise exception 'school logo bucket does not enforce the expected public-branding configuration';
  end if;

  if not exists (
    select 1 from pg_policies as policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname = 'school logos scoped insert'
      and policy.cmd = 'INSERT'
      and policy.with_check ilike '%school.update%'
  ) then
    raise exception 'school logo insert policy is missing or not scoped to school.update';
  end if;

  if not exists (
    select 1 from pg_policies as policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname = 'school logos scoped delete'
      and policy.cmd = 'DELETE'
      and policy.qual ilike '%school.update%'
  ) then
    raise exception 'school logo delete policy is missing or not scoped to school.update';
  end if;
end
$$;
