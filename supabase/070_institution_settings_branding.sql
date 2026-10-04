-- QuranOS V2 - institution profile and public branding assets
-- Institution logos are public brand assets displayed in the application and on receipts.

begin;

alter table public.schools
  add column if not exists contact_phone text,
  add column if not exists contact_email text,
  add column if not exists address text,
  add column if not exists website_url text,
  add column if not exists logo_path text;

alter table public.schools
  drop constraint if exists schools_contact_phone_check,
  drop constraint if exists schools_contact_email_check,
  drop constraint if exists schools_address_check,
  drop constraint if exists schools_website_url_check,
  drop constraint if exists schools_logo_path_check;

alter table public.schools
  add constraint schools_contact_phone_check
    check (contact_phone is null or char_length(btrim(contact_phone)) between 1 and 40),
  add constraint schools_contact_email_check
    check (
      contact_email is null
      or (
        contact_email = btrim(contact_email)
        and char_length(contact_email) between 3 and 254
        and position('@' in contact_email) between 2 and char_length(contact_email) - 1
        and contact_email !~ '[[:space:]]'
      )
    ),
  add constraint schools_address_check
    check (address is null or char_length(btrim(address)) between 1 and 500),
  add constraint schools_website_url_check
    check (
      website_url is null
      or (
        website_url = btrim(website_url)
        and char_length(website_url) between 8 and 500
        and website_url ~ '^https?://[^[:space:]]+$'
      )
    ),
  add constraint schools_logo_path_check
    check (
      logo_path is null
      or (
        char_length(logo_path) <= 255
        and split_part(logo_path, '/', 1) = id::text
        and split_part(logo_path, '/', 2) ~ '^[0-9a-f-]{36}\.(png|jpg|webp)$'
        and split_part(logo_path, '/', 3) = ''
      )
    );

comment on column public.schools.contact_phone is 'Optional public contact phone displayed with institution branding.';
comment on column public.schools.contact_email is 'Optional public contact email displayed with institution branding.';
comment on column public.schools.address is 'Optional institution address displayed with institution branding.';
comment on column public.schools.website_url is 'Optional public website URL; only HTTP(S) URLs are accepted.';
comment on column public.schools.logo_path is 'Public logo asset path in the school-logos bucket, scoped to this school id.';

grant update (contact_phone, contact_email, address, website_url, logo_path)
  on public.schools to authenticated;

drop trigger if exists schools_set_updated_at on public.schools;
create trigger schools_set_updated_at
before update on public.schools
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'school-logos',
  'school-logos',
  true,
  1048576,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "school logos scoped insert" on storage.objects;
drop policy if exists "school logos scoped delete" on storage.objects;

create policy "school logos scoped insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'school-logos'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'
  and exists (
    select 1
    from public.schools as school
    where school.id::text = (storage.foldername(name))[1]
      and school.status = 'active'
      and public.has_school_permission(school.id, 'school.update')
  )
);

create policy "school logos scoped delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'school-logos'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'
  and exists (
    select 1
    from public.schools as school
    where school.id::text = (storage.foldername(name))[1]
      and school.status = 'active'
      and public.has_school_permission(school.id, 'school.update')
  )
);

commit;
