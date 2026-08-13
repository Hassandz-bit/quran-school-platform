import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import LegacyPageTranslation from "@/components/LegacyPageTranslation";
import { getSupabaseClient } from "@/lib/supabase";
import {
  DEFAULT_CURRENCY,
  configureCurrencyFormatting,
  normalizeCurrency,
  type CurrencyCode,
} from "@/lib/currency";
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  getDirection,
  normalizeLocale,
  translate,
  type AppDirection,
  type AppLocale,
  type TranslationKey,
} from "@/lib/locale";

type LocaleContextValue = {
  locale: AppLocale;
  direction: AppDirection;
  isSavingLocale: boolean;
  setLocale: (locale: AppLocale) => void;
  currency: CurrencyCode;
  canChangeCurrency: boolean;
  isSavingCurrency: boolean;
  setCurrency: (currency: CurrencyCode) => Promise<boolean>;
  t: (key: TranslationKey) => string;
};

const FALLBACK_LOCALE_CONTEXT: LocaleContextValue = {
  locale: DEFAULT_LOCALE,
  direction: getDirection(DEFAULT_LOCALE),
  isSavingLocale: false,
  setLocale: () => undefined,
  currency: DEFAULT_CURRENCY,
  canChangeCurrency: false,
  isSavingCurrency: false,
  setCurrency: async () => false,
  t: key => translate(DEFAULT_LOCALE, key),
};

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

function getStoredLocale(): AppLocale {
  try {
    return normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY)) ?? DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

function hasStoredLocale(): boolean {
  try {
    return normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY)) !== null;
  } catch {
    return false;
  }
}

function persistLocalLocale(locale: AppLocale) {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage can be unavailable in strict privacy modes. The in-memory choice
    // still applies for the current session.
  }
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const {
    profile,
    user,
    school,
    isSchoolAdmin,
    reloadAuthorization,
  } = useAuth();
  const [locale, setLocaleState] = useState<AppLocale>(getStoredLocale);
  const [isSavingLocale, setIsSavingLocale] = useState(false);
  const [currency, setCurrencyState] = useState<CurrencyCode>(() =>
    normalizeCurrency(school?.currency_code)
  );
  const [isSavingCurrency, setIsSavingCurrency] = useState(false);
  const loginChoiceRef = useRef(hasStoredLocale());

  const applyLocale = useCallback((nextLocale: AppLocale) => {
    setLocaleState(nextLocale);
    persistLocalLocale(nextLocale);
  }, []);

  useEffect(() => {
    const profileLocale = normalizeLocale(profile?.locale);
    if (!profileLocale) return;

    if (!loginChoiceRef.current) {
      applyLocale(profileLocale);
      return;
    }

    if (!user || profileLocale === locale) return;
    let active = true;
    setIsSavingLocale(true);
    void (async () => {
      try {
        const { error } = await getSupabaseClient()
          .from("profiles")
          .update({ locale })
          .eq("id", user.id)
          .eq("status", "active");
        if (error) throw error;
      } catch {
        // The explicit login choice still applies locally for this session.
      } finally {
        if (active) setIsSavingLocale(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [applyLocale, locale, profile?.locale, user]);

  useEffect(() => {
    setCurrencyState(normalizeCurrency(school?.currency_code));
  }, [school?.currency_code]);

  useEffect(() => {
    const direction = getDirection(locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
    document.body.dir = direction;
  }, [locale]);

  const setLocale = useCallback(
    (nextLocale: AppLocale) => {
      loginChoiceRef.current = true;
      applyLocale(nextLocale);
    },
    [applyLocale]
  );

  const setCurrency = useCallback(
    async (nextCurrency: CurrencyCode): Promise<boolean> => {
      if (!school?.id || !isSchoolAdmin) return false;
      const normalized = normalizeCurrency(nextCurrency);
      const previous = currency;
      setCurrencyState(normalized);
      setIsSavingCurrency(true);
      try {
        const { error } = await getSupabaseClient()
          .from("schools")
          .update({ currency_code: normalized })
          .eq("id", school.id)
          .eq("status", "active");
        if (error) throw error;
        await reloadAuthorization();
        return true;
      } catch {
        setCurrencyState(previous);
        return false;
      } finally {
        setIsSavingCurrency(false);
      }
    },
    [currency, isSchoolAdmin, reloadAuthorization, school?.id]
  );

  configureCurrencyFormatting(currency, locale);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      direction: getDirection(locale),
      isSavingLocale,
      setLocale,
      currency,
      canChangeCurrency: isSchoolAdmin,
      isSavingCurrency,
      setCurrency,
      t: (key: TranslationKey) => translate(locale, key),
    }),
    [
      currency,
      isSavingCurrency,
      isSavingLocale,
      isSchoolAdmin,
      locale,
      setCurrency,
      setLocale,
    ]
  );

  return (
    <LocaleContext.Provider value={value}>
      <LegacyPageTranslation locale={locale} />
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext) ?? FALLBACK_LOCALE_CONTEXT;
}
