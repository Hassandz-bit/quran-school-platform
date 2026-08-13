import type { AppLocale } from "./locale";

export const SUPPORTED_CURRENCIES = [
  "DZD",
  "TND",
  "MAD",
  "EUR",
  "USD",
  "SAR",
  "AED",
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export const DEFAULT_CURRENCY: CurrencyCode = "DZD";

let activeCurrency: CurrencyCode = DEFAULT_CURRENCY;
let activeLocale: AppLocale = "ar";

export function normalizeCurrency(value: unknown): CurrencyCode {
  return SUPPORTED_CURRENCIES.includes(value as CurrencyCode)
    ? (value as CurrencyCode)
    : DEFAULT_CURRENCY;
}

export function configureCurrencyFormatting(
  currency: CurrencyCode,
  locale: AppLocale
) {
  activeCurrency = normalizeCurrency(currency);
  activeLocale = locale;
}

export function getActiveCurrency(): CurrencyCode {
  return activeCurrency;
}

export function formatCurrency(
  amount: number,
  currency: CurrencyCode = activeCurrency,
  locale: AppLocale = activeLocale
): string {
  return new Intl.NumberFormat(
    locale === "ar" ? "ar-DZ-u-nu-latn" : "en-GB",
    {
      style: "currency",
      currency: normalizeCurrency(currency),
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }
  ).format(amount);
}

export function getCurrencyDisplayName(
  currency: CurrencyCode,
  locale: AppLocale
): string {
  try {
    return (
      new Intl.DisplayNames(
        [locale === "ar" ? "ar-DZ" : "en"],
        { type: "currency" }
      ).of(currency) ?? currency
    );
  } catch {
    return currency;
  }
}
