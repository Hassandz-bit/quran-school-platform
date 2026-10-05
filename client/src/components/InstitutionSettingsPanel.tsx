import { useEffect, useRef, useState, type FormEvent } from "react";
import { Building2, ImagePlus, RefreshCw, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import {
  getInstitutionLogoUrl,
  hasInstitutionSettingsPermission,
  SCHOOL_LOGO_MAX_BYTES,
  saveInstitutionSettings,
} from "@/lib/institution-settings";

export default function InstitutionSettingsPanel() {
  const { school, reloadAuthorization } = useAuth();
  const { t } = useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [canManage, setCanManage] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [address, setAddress] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setCheckingAccess(true);
    if (!school?.id) {
      setCanManage(false);
      setCheckingAccess(false);
      return () => { active = false; };
    }

    void hasInstitutionSettingsPermission(school.id)
      .then(allowed => {
        if (active) setCanManage(allowed);
      })
      .catch(() => {
        if (active) setCanManage(false);
      })
      .finally(() => {
        if (active) setCheckingAccess(false);
      });

    return () => { active = false; };
  }, [school?.id]);

  useEffect(() => {
    setName(school?.name ?? "");
    setContactPhone(school?.contact_phone ?? "");
    setContactEmail(school?.contact_email ?? "");
    setAddress(school?.address ?? "");
    setWebsiteUrl(school?.website_url ?? "");
    setLogoFile(null);
    setRemoveLogo(false);
  }, [
    school?.id,
    school?.name,
    school?.contact_phone,
    school?.contact_email,
    school?.address,
    school?.website_url,
    school?.logo_path,
  ]);

  useEffect(() => {
    if (!logoFile) {
      setLocalPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(logoFile);
    setLocalPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  const currentLogoUrl = getInstitutionLogoUrl(school?.logo_path);
  const displayedLogoUrl = removeLogo ? null : localPreviewUrl ?? currentLogoUrl;

  const handleLogoFile = (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error(t("institution.logoTypeError"));
      return;
    }
    if (file.size <= 0 || file.size > SCHOOL_LOGO_MAX_BYTES) {
      toast.error(t("institution.logoSizeError"));
      return;
    }
    setRemoveLogo(false);
    setLogoFile(file);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!school?.id || !canManage || saving) return;
    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 150) {
      toast.error(t("institution.nameError"));
      return;
    }

    setSaving(true);
    try {
      await saveInstitutionSettings({
        schoolId: school.id,
        name: trimmedName,
        contactPhone,
        contactEmail,
        address,
        websiteUrl,
        currentLogoPath: school.logo_path,
        logoFile,
        removeLogo,
      });
      setLogoFile(null);
      setRemoveLogo(false);
      await reloadAuthorization();
      toast.success(t("institution.saved"));
    } catch {
      toast.error(t("institution.saveError"));
    } finally {
      setSaving(false);
    }
  };

  if (checkingAccess) {
    return (
      <section className="rounded-xl border border-gray-200 p-4" aria-busy="true">
        <p className="text-sm text-gray-500">{t("institution.checkingAccess")}</p>
      </section>
    );
  }
  if (!canManage || !school) return null;

  return (
    <section className="rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2">
        <Building2 size={18} className="text-[#17663B]" aria-hidden="true" />
        <h3 className="font-bold">{t("institution.title")}</h3>
      </div>
      <p className="mt-2 text-sm leading-6 text-gray-600">
        {t("institution.description")}
      </p>

      <form className="mt-4 space-y-4" onSubmit={event => void handleSubmit(event)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm font-semibold sm:col-span-2" htmlFor="institution-name">
            {t("institution.name")}
            <Input
              id="institution-name"
              value={name}
              onChange={event => setName(event.target.value)}
              required
              minLength={2}
              maxLength={150}
              autoComplete="organization"
            />
          </label>
          <label className="space-y-1.5 text-sm font-semibold" htmlFor="institution-phone">
            {t("institution.phone")}
            <Input
              id="institution-phone"
              value={contactPhone}
              onChange={event => setContactPhone(event.target.value)}
              maxLength={40}
              autoComplete="tel"
              dir="ltr"
            />
          </label>
          <label className="space-y-1.5 text-sm font-semibold" htmlFor="institution-email">
            {t("institution.email")}
            <Input
              id="institution-email"
              type="email"
              value={contactEmail}
              onChange={event => setContactEmail(event.target.value)}
              maxLength={254}
              autoComplete="email"
              dir="ltr"
            />
          </label>
          <label className="space-y-1.5 text-sm font-semibold sm:col-span-2" htmlFor="institution-address">
            {t("institution.address")}
            <textarea
              id="institution-address"
              value={address}
              onChange={event => setAddress(event.target.value)}
              maxLength={500}
              rows={2}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-normal shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </label>
          <label className="space-y-1.5 text-sm font-semibold sm:col-span-2" htmlFor="institution-website">
            {t("institution.website")}
            <Input
              id="institution-website"
              type="url"
              value={websiteUrl}
              onChange={event => setWebsiteUrl(event.target.value)}
              maxLength={500}
              autoComplete="url"
              dir="ltr"
            />
          </label>
        </div>

        <div className="rounded-xl border border-dashed border-gray-300 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#F0F6F1] text-[#17663B]">
              {displayedLogoUrl ? (
                <img src={displayedLogoUrl} alt={t("institution.logoAlt")} className="size-full object-contain" />
              ) : (
                <ImagePlus size={25} aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{t("institution.logo")}</p>
              <p className="mt-1 text-xs leading-5 text-gray-500">{t("institution.logoHelp")}</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              aria-label={t("institution.selectLogo")}
              onChange={event => {
                handleLogoFile(event.currentTarget.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={15} aria-hidden="true" />
              {t("institution.selectLogo")}
            </Button>
            {logoFile ? (
              <Button type="button" variant="ghost" size="sm" className="gap-2" onClick={() => setLogoFile(null)}>
                <RotateCcw size={15} aria-hidden="true" />
                {t("institution.cancelLogoSelection")}
              </Button>
            ) : school.logo_path && !removeLogo ? (
              <Button type="button" variant="ghost" size="sm" className="gap-2 text-red-700" onClick={() => setRemoveLogo(true)}>
                <Trash2 size={15} aria-hidden="true" />
                {t("institution.removeLogo")}
              </Button>
            ) : removeLogo ? (
              <Button type="button" variant="ghost" size="sm" className="gap-2" onClick={() => setRemoveLogo(false)}>
                <RotateCcw size={15} aria-hidden="true" />
                {t("institution.undoLogoRemoval")}
              </Button>
            ) : null}
          </div>
        </div>

        <Button type="submit" disabled={saving} className="w-full gap-2 bg-[#0B4738] text-white hover:bg-[#08382d]">
          {saving ? <RefreshCw size={16} className="animate-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
          {saving ? t("institution.saving") : t("institution.save")}
        </Button>
      </form>
    </section>
  );
}
