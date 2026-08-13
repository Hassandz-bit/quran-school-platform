import { useState } from "react";
import { Languages, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useLocale } from "@/contexts/LocaleContext";
import {
  CURRENCY_GROUPS,
  getCurrencyDisplayName,
  type CurrencyCode,
} from "@/lib/currency";

export default function PreferencesDialog() {
  const [open, setOpen] = useState(false);
  const {
    locale,
    currency,
    canChangeCurrency,
    isSavingCurrency,
    setLocale,
    setCurrency,
    t,
  } = useLocale();

  const handleCurrencyChange = async (nextCurrency: CurrencyCode) => {
    const saved = await setCurrency(nextCurrency);
    if (saved) toast.success(t("settings.currencySaved"));
    else toast.error(t("settings.currencySaveError"));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-[#244E3B]"
          aria-label={t("settings.open")}
          title={t("settings.open")}
        >
          <Settings2 size={19} aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("settings.title")}</DialogTitle>
          <DialogDescription>{t("settings.subtitle")}</DialogDescription>
        </DialogHeader>

        <section className="rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2">
            <Languages size={18} className="text-[#17663B]" aria-hidden="true" />
            <h3 className="font-bold">{t("settings.languageTitle")}</h3>
          </div>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            {t("settings.languageDescription")}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2" dir="ltr">
            <Button
              type="button"
              variant={locale === "ar" ? "default" : "outline"}
              onClick={() => setLocale("ar")}
            >
              {t("settings.arabic")}
            </Button>
            <Button
              type="button"
              variant={locale === "en" ? "default" : "outline"}
              onClick={() => setLocale("en")}
            >
              {t("settings.english")}
            </Button>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 p-4">
          <h3 className="font-bold">{t("settings.currencyTitle")}</h3>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            {t("settings.currencyDescription")}
          </p>
          <label className="mt-4 block text-sm font-semibold" htmlFor="school-currency">
            {t("settings.currencyCurrent")}
          </label>
          <select
            id="school-currency"
            value={currency}
            disabled={!canChangeCurrency || isSavingCurrency}
            onChange={event => void handleCurrencyChange(event.target.value as CurrencyCode)}
            className="mt-2 h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm disabled:cursor-not-allowed disabled:bg-gray-100"
          >
            {CURRENCY_GROUPS.map(group => (
              <optgroup key={group.id} label={group.label[locale]}>
                {group.currencies.map(code => (
                  <option key={code} value={code}>
                    {code} — {getCurrencyDisplayName(code, locale)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {!canChangeCurrency && (
            <p className="mt-2 text-xs text-amber-700">
              {t("settings.currencyAdminOnly")}
            </p>
          )}
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-900">
            {t("settings.currencyWarning")}
          </p>
        </section>
      </DialogContent>
    </Dialog>
  );
}
