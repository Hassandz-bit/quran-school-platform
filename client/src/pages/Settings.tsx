import { Check, Languages, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "@/contexts/LocaleContext";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/lib/locale";

const LANGUAGE_OPTIONS: Array<{
  locale: AppLocale;
  nativeLabel: string;
  secondaryLabel: string;
}> = [
  { locale: "ar", nativeLabel: "العربية", secondaryLabel: "Arabic · RTL" },
  { locale: "en", nativeLabel: "English", secondaryLabel: "English · LTR" },
];

export default function Settings() {
  const { locale, saveLocale, isSavingLocale, t } = useLocale();

  const handleLanguageChange = async (nextLocale: AppLocale) => {
    if (nextLocale === locale || isSavingLocale) return;

    try {
      await saveLocale(nextLocale);
      toast.success(t("settings.saved"));
    } catch {
      toast.error(t("settings.saveError"));
    }
  };

  return (
    <section className="mx-auto w-full max-w-3xl space-y-6">
      <header>
        <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-[#E9F4EC] text-[#17663B]">
          <Languages size={23} aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-extrabold text-[#173B2D] sm:text-3xl">
          {t("settings.title")}
        </h1>
        <p className="mt-2 text-sm leading-7 text-[#64756D]">
          {t("settings.subtitle")}
        </p>
      </header>

      <article className="rounded-3xl border border-[#DCE7DF] bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#F0F6F1] text-[#17663B]">
            <Languages size={20} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[#173B2D]">
              {t("settings.languageTitle")}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-7 text-[#64756D]">
              {t("settings.languageDescription")}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {LANGUAGE_OPTIONS.map(option => {
            const selected = option.locale === locale;
            return (
              <button
                key={option.locale}
                type="button"
                disabled={isSavingLocale}
                onClick={() => void handleLanguageChange(option.locale)}
                className={cn(
                  "flex min-h-24 items-center justify-between gap-4 rounded-2xl border p-4 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F855A] disabled:cursor-wait disabled:opacity-70",
                  selected
                    ? "border-[#2F855A] bg-[#EAF4EC] shadow-sm"
                    : "border-[#DCE7DF] bg-[#FDFEFA] hover:border-[#AFC8B7] hover:bg-[#F6FAF6]"
                )}
                aria-pressed={selected}
              >
                <span>
                  <span className="block text-base font-extrabold text-[#173B2D]">
                    {option.nativeLabel}
                  </span>
                  <span className="mt-1 block text-xs text-[#718377]">
                    {option.secondaryLabel}
                  </span>
                </span>
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full border",
                    selected
                      ? "border-[#2F855A] bg-[#2F855A] text-white"
                      : "border-[#CDD9D0] text-transparent"
                  )}
                  aria-hidden="true"
                >
                  {isSavingLocale && !selected ? (
                    <Loader2 size={16} className="animate-spin text-[#2F855A]" />
                  ) : (
                    <Check size={16} />
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 rounded-2xl bg-[#F7F8F3] px-4 py-3 text-sm text-[#51665B]">
          <span className="font-semibold">{t("settings.current")}:</span>{" "}
          <span>{locale === "ar" ? t("settings.arabic") : t("settings.english")}</span>
          <span className="mx-2 text-[#A6B4AA]">•</span>
          <span>{isSavingLocale ? t("settings.saving") : t("settings.directionHint")}</span>
        </div>
      </article>
    </section>
  );
}
