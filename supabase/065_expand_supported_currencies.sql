-- QuranOS V2 - expand school currencies across Islamic countries,
-- Europe, and the Americas. Existing values and amounts are unchanged.

begin;

alter table public.schools
  drop constraint if exists schools_currency_code_check;
alter table public.schools
  add constraint schools_currency_code_check
  check (currency_code in (
    'AFN', 'ALL', 'DZD', 'AZN', 'BHD', 'BDT', 'XOF', 'BND', 'XAF',
    'BAM', 'KMF', 'DJF', 'EGP', 'GMD', 'GNF', 'GYD', 'IDR', 'IRR',
    'IQD', 'JOD', 'ILS', 'KZT', 'KWD', 'KGS', 'LBP', 'LYD', 'MYR',
    'MVR', 'MRU', 'MAD', 'MZN', 'NGN', 'OMR', 'PKR', 'QAR', 'SAR',
    'SLE', 'SOS', 'SDG', 'SRD', 'SYP', 'TJS', 'TND', 'TRY', 'TMT',
    'UGX', 'AED', 'UZS', 'YER', 'EUR', 'GBP', 'CHF', 'NOK', 'SEK',
    'DKK', 'ISK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'MKD', 'RSD',
    'MDL', 'UAH', 'BYN', 'RUB', 'GEL', 'AMD', 'GIP', 'USD', 'CAD',
    'MXN', 'BZD', 'GTQ', 'HNL', 'NIO', 'CRC', 'PAB', 'DOP', 'HTG',
    'JMD', 'CUP', 'BSD', 'BBD', 'TTD', 'XCD', 'AWG', 'ANG', 'KYD',
    'BMD', 'BRL', 'ARS', 'CLP', 'COP', 'PEN', 'BOB', 'PYG', 'UYU',
    'VES', 'FKP'
  ));

alter table public.fee_plans
  drop constraint if exists fee_plans_currency_check;
alter table public.fee_plans
  add constraint fee_plans_currency_check
  check (currency in (
    'AFN', 'ALL', 'DZD', 'AZN', 'BHD', 'BDT', 'XOF', 'BND', 'XAF',
    'BAM', 'KMF', 'DJF', 'EGP', 'GMD', 'GNF', 'GYD', 'IDR', 'IRR',
    'IQD', 'JOD', 'ILS', 'KZT', 'KWD', 'KGS', 'LBP', 'LYD', 'MYR',
    'MVR', 'MRU', 'MAD', 'MZN', 'NGN', 'OMR', 'PKR', 'QAR', 'SAR',
    'SLE', 'SOS', 'SDG', 'SRD', 'SYP', 'TJS', 'TND', 'TRY', 'TMT',
    'UGX', 'AED', 'UZS', 'YER', 'EUR', 'GBP', 'CHF', 'NOK', 'SEK',
    'DKK', 'ISK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'MKD', 'RSD',
    'MDL', 'UAH', 'BYN', 'RUB', 'GEL', 'AMD', 'GIP', 'USD', 'CAD',
    'MXN', 'BZD', 'GTQ', 'HNL', 'NIO', 'CRC', 'PAB', 'DOP', 'HTG',
    'JMD', 'CUP', 'BSD', 'BBD', 'TTD', 'XCD', 'AWG', 'ANG', 'KYD',
    'BMD', 'BRL', 'ARS', 'CLP', 'COP', 'PEN', 'BOB', 'PYG', 'UYU',
    'VES', 'FKP'
  ));

alter table public.treasury_accounts
  drop constraint if exists treasury_accounts_currency_check;
alter table public.treasury_accounts
  add constraint treasury_accounts_currency_check
  check (currency in (
    'AFN', 'ALL', 'DZD', 'AZN', 'BHD', 'BDT', 'XOF', 'BND', 'XAF',
    'BAM', 'KMF', 'DJF', 'EGP', 'GMD', 'GNF', 'GYD', 'IDR', 'IRR',
    'IQD', 'JOD', 'ILS', 'KZT', 'KWD', 'KGS', 'LBP', 'LYD', 'MYR',
    'MVR', 'MRU', 'MAD', 'MZN', 'NGN', 'OMR', 'PKR', 'QAR', 'SAR',
    'SLE', 'SOS', 'SDG', 'SRD', 'SYP', 'TJS', 'TND', 'TRY', 'TMT',
    'UGX', 'AED', 'UZS', 'YER', 'EUR', 'GBP', 'CHF', 'NOK', 'SEK',
    'DKK', 'ISK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'MKD', 'RSD',
    'MDL', 'UAH', 'BYN', 'RUB', 'GEL', 'AMD', 'GIP', 'USD', 'CAD',
    'MXN', 'BZD', 'GTQ', 'HNL', 'NIO', 'CRC', 'PAB', 'DOP', 'HTG',
    'JMD', 'CUP', 'BSD', 'BBD', 'TTD', 'XCD', 'AWG', 'ANG', 'KYD',
    'BMD', 'BRL', 'ARS', 'CLP', 'COP', 'PEN', 'BOB', 'PYG', 'UYU',
    'VES', 'FKP'
  ));

alter table public.official_receipts
  drop constraint if exists official_receipts_currency_check;
alter table public.official_receipts
  add constraint official_receipts_currency_check
  check (currency in (
    'AFN', 'ALL', 'DZD', 'AZN', 'BHD', 'BDT', 'XOF', 'BND', 'XAF',
    'BAM', 'KMF', 'DJF', 'EGP', 'GMD', 'GNF', 'GYD', 'IDR', 'IRR',
    'IQD', 'JOD', 'ILS', 'KZT', 'KWD', 'KGS', 'LBP', 'LYD', 'MYR',
    'MVR', 'MRU', 'MAD', 'MZN', 'NGN', 'OMR', 'PKR', 'QAR', 'SAR',
    'SLE', 'SOS', 'SDG', 'SRD', 'SYP', 'TJS', 'TND', 'TRY', 'TMT',
    'UGX', 'AED', 'UZS', 'YER', 'EUR', 'GBP', 'CHF', 'NOK', 'SEK',
    'DKK', 'ISK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'MKD', 'RSD',
    'MDL', 'UAH', 'BYN', 'RUB', 'GEL', 'AMD', 'GIP', 'USD', 'CAD',
    'MXN', 'BZD', 'GTQ', 'HNL', 'NIO', 'CRC', 'PAB', 'DOP', 'HTG',
    'JMD', 'CUP', 'BSD', 'BBD', 'TTD', 'XCD', 'AWG', 'ANG', 'KYD',
    'BMD', 'BRL', 'ARS', 'CLP', 'COP', 'PEN', 'BOB', 'PYG', 'UYU',
    'VES', 'FKP'
  ));

commit;

