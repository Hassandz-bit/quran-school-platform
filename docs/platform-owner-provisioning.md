# Provision the first QuranOS platform owner

This is a one-time trusted-administrator operation. A platform owner is **not** a school role and must never be created through public signup, a browser request, or user-editable Auth metadata.

## Steps

1. Create the dedicated owner account in Supabase Auth (Dashboard → Authentication → Users). Use an email controlled by the platform operator and enable the required account security controls.
2. Copy that Auth user's UUID.
3. Open the SQL Editor for the production project and run the guarded statement below after migration `082_platform_subscriptions_foundation.sql` has been reviewed and applied.
4. Sign in to QuranOS with that account and open `/platform-owner`. The post-login redirect will recognize the owner registry record.

## Guarded SQL

Replace the placeholder with the UUID copied from Auth Users. This statement does not create an Auth account and does not set or change a password.

```sql
do $platform_owner_bootstrap$
declare
  v_owner_user_id uuid;
  v_owner_user_id_text constant text := '__PLATFORM_OWNER_AUTH_USER_ID__';
begin
  if v_owner_user_id_text = '__PLATFORM_OWNER_AUTH_USER_ID__' then
    raise exception 'Replace __PLATFORM_OWNER_AUTH_USER_ID__ with the existing Auth user UUID.';
  end if;

  begin
    v_owner_user_id := v_owner_user_id_text::uuid;
  exception when invalid_text_representation then
    raise exception 'The platform owner Auth UUID is invalid.';
  end;

  if not exists (select 1 from auth.users where id = v_owner_user_id) then
    raise exception 'No Auth user exists for the supplied UUID.';
  end if;

  insert into public.platform_owners (user_id)
  values (v_owner_user_id)
  on conflict (user_id) do nothing;
end;
$platform_owner_bootstrap$;

select user_id, created_at
from public.platform_owners
where user_id = '__PLATFORM_OWNER_AUTH_USER_ID__'::uuid;
```

## Expiry reminders

After migration 082 is applied and validated, follow [`docs/school-subscription-expiry-reminders.md`](school-subscription-expiry-reminders.md) to enable `pg_cron` and schedule the daily 30-day and 7-day reminder generator.

## Security notes

- Never insert a school administrator into `platform_owners`.
- Never use `raw_user_meta_data`, `user_metadata`, a client-supplied role, or a school membership to grant platform-owner access.
- The browser can read only its own `platform_owners` row. It has no INSERT, UPDATE, or DELETE privileges on this table.
- The first owner is provisioned only by a trusted database administrator. Additional owners require a separate controlled administrative procedure.
