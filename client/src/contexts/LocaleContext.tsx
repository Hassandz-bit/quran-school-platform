import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
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
  saveLocale: (locale: AppLocale) => Promise<void>;
  t: (key: TranslationKey) => string;
};

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

function getStoredLocale(): AppLocale {
  try {
    return normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY)) ?? DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
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

  const applyLocale = useCallback((nextLocale: AppLocale) => {
    setLocaleState(nextLocale);
    persistLocalLocale(nextLocale);
  }, []);

  useEffect(() => {
    const profileLocale = normalizeLocale(profile?.locale);
    if (profileLocale) applyLocale(profileLocale);
  }, [applyLocale, profile?.locale]);

  useEffect(() => {
    const direction = getDirection(locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
    document.body.dir = direction;
  }, [locale]);

  const setLocale = useCallback(
    (nextLocale: AppLocale) => {
      applyLocale(nextLocale);
    },
    [applyLocale]
  );

  const saveLocale = useCallback(
    async (nextLocale: AppLocale) => {
      const previousLocale = locale;
      applyLocale(nextLocale);

      if (!user) return;

      setIsSavingLocale(true);
      try {
        const client = getSupabaseClient();
        const { error } = await client
          .from("profiles")
          .update({ locale: nextLocale })
          .eq("id", user.id)
          .eq("status", "active");

        if (error) throw error;
      } catch (error) {
        applyLocale(previousLocale);
        throw error;
      } finally {
        setIsSavingLocale(false);
      }
    },
    [applyLocale, locale, user]
  );

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      direction: getDirection(locale),
      isSavingLocale,
      setLocale,
      saveLocale,
      t: (key: TranslationKey) => translate(locale, key),
    }),
    [isSavingLocale, locale, saveLocale, setLocale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used inside LocaleProvider.");
  }
  return context;
}
