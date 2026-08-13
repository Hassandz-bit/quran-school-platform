import type { AppLocale } from "./locale";

export const CURRENCY_GROUPS = [
  {
    id: "islamic",
    label: { ar: "الدول الإسلامية", en: "Islamic countries" },
    currencies: [
      "AFN", "ALL", "DZD", "AZN", "BHD", "BDT", "XOF", "BND", "XAF",
      "BAM", "KMF", "DJF", "EGP", "GMD", "GNF", "GYD", "IDR", "IRR",
      "IQD", "JOD", "ILS", "KZT", "KWD", "KGS", "LBP", "LYD", "MYR",
      "MVR", "MRU", "MAD", "MZN", "NGN", "OMR", "PKR", "QAR", "SAR",
      "SLE", "SOS", "SDG", "SRD", "SYP", "TJS", "TND", "TRY", "TMT",
      "UGX", "AED", "UZS", "YER",
    ],
  },
  {
    id: "europe",
    label: { ar: "أوروبا", en: "Europe" },
    currencies: [
      "EUR", "GBP", "CHF", "NOK", "SEK", "DKK", "ISK", "PLN", "CZK",
      "HUF", "RON", "BGN", "MKD", "RSD", "MDL", "UAH", "BYN", "RUB",
      "GEL", "AMD", "GIP",
    ],
  },
  {
    id: "americas",
    label: { ar: "الأمريكيتان", en: "The Americas" },
    currencies: [
      "USD", "CAD", "MXN", "BZD", "GTQ", "HNL", "NIO", "CRC", "PAB",
      "DOP", "HTG", "JMD", "CUP", "BSD", "BBD", "TTD", "XCD", "AWG",
      "ANG", "KYD", "BMD", "BRL", "ARS", "CLP", "COP", "PEN", "BOB",
      "PYG", "UYU", "VES", "FKP",
    ],
  },
] as const;

export type CurrencyCode =
  (typeof CURRENCY_GROUPS)[number]["currencies"][number];

export const SUPPORTED_CURRENCIES: readonly CurrencyCode[] =
  CURRENCY_GROUPS.flatMap(group => group.currencies);

const SUPPORTED_CURRENCY_SET = new Set<string>(SUPPORTED_CURRENCIES);

export const DEFAULT_CURRENCY: CurrencyCode = "DZD";

let activeCurrency: CurrencyCode = DEFAULT_CURRENCY;
let activeLocale: AppLocale = "ar";

export function normalizeCurrency(value: unknown): CurrencyCode {
  return typeof value === "string" && SUPPORTED_CURRENCY_SET.has(value)
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
