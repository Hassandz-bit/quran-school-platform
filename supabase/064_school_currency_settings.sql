-- QuranOS V2 - school-wide currency settings

begin;

alter table public.schools
  add column if not exists currency_code text not null default 'DZD';

alter table public.schools
  drop constraint if exists schools_currency_code_check;
alter table public.schools
  add constraint schools_currency_code_check
  check (currency_code in ('DZD', 'TND', 'MAD', 'EUR', 'USD', 'SAR', 'AED'));

comment on column public.schools.currency_code is
  'School base/display currency. Changing it does not convert stored numeric amounts.';

revoke update (currency_code) on public.schools from anon;
grant update (currency_code) on public.schools to authenticated;

alter table public.fee_plans
  drop constraint if exists fee_plans_currency_check;
alter table public.fee_plans
  add constraint fee_plans_currency_check
  check (currency in ('DZD', 'TND', 'MAD', 'EUR', 'USD', 'SAR', 'AED'));

alter table public.treasury_accounts
  drop constraint if exists treasury_accounts_currency_check;
alter table public.treasury_accounts
  add constraint treasury_accounts_currency_check
  check (currency in ('DZD', 'TND', 'MAD', 'EUR', 'USD', 'SAR', 'AED'));

alter table public.official_receipts
  drop constraint if exists official_receipts_currency_check;
alter table public.official_receipts
  add constraint official_receipts_currency_check
  check (currency in ('DZD', 'TND', 'MAD', 'EUR', 'USD', 'SAR', 'AED'));

create or replace function public.apply_school_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select school.currency_code
  into new.currency
  from public.schools as school
  where school.id = new.school_id;

  new.currency := coalesce(new.currency, 'DZD');
  return new;
end;
$$;

revoke all on function public.apply_school_currency()
from public, anon, authenticated;

drop trigger if exists fee_plans_apply_school_currency on public.fee_plans;
create trigger fee_plans_apply_school_currency
before insert on public.fee_plans
for each row execute function public.apply_school_currency();

drop trigger if exists treasury_accounts_apply_school_currency on public.treasury_accounts;
create trigger treasury_accounts_apply_school_currency
before insert on public.treasury_accounts
for each row execute function public.apply_school_currency();

drop trigger if exists official_receipts_apply_school_currency on public.official_receipts;
create trigger official_receipts_apply_school_currency
before insert on public.official_receipts
for each row execute function public.apply_school_currency();

commit;
