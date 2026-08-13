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
  t: (key: TranslationKey) => string;
};

const FALLBACK_LOCALE_CONTEXT: LocaleContextValue = {
  locale: DEFAULT_LOCALE,
  direction: getDirection(DEFAULT_LOCALE),
  isSavingLocale: false,
  setLocale: () => undefined,
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
  const { profile, user } = useAuth();
  const [locale, setLocaleState] = useState<AppLocale>(getStoredLocale);
  const [isSavingLocale, setIsSavingLocale] = useState(false);
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

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      direction: getDirection(locale),
      isSavingLocale,
      setLocale,
      t: (key: TranslationKey) => translate(locale, key),
    }),
    [isSavingLocale, locale, setLocale]
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
