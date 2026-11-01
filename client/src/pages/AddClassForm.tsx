import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, RefreshCw } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import {
  addClass,
  fetchSchoolBranches,
  STUDY_DAY_KEYS,
  getClassSaveErrorMessage,
  normalizeClassCode,
  translateClassStatus,
  type ClassBranch,
  type ClassFormValues,
  type ClassStatus,
} from "@/lib/classes";

const statusOptions: ClassStatus[] = ["active", "inactive", "archived"];

const AddClassForm: React.FC = () => {
  const { locale: language, direction } = useLocale();
  const [branches, setBranches] = useState<ClassBranch[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(true);
  const [branchLoadError, setBranchLoadError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<ClassFormValues>({
    branchId: "",
    name: "",
    code: "",
    scheduleLabel: "",
    studyDays: [],
    startTime: "",
    endTime: "",
    status: "active",
  });
  const [, setLocation] = useLocation();
  const { school } = useAuth();

  const content = useMemo(
    () => ({
      ar: {
        title: "إضافة حلقة جديدة",
        subtitle: "أدخل بيانات الحلقة وربطها بأحد فروع المدرسة.",
        school: "المدرسة",
        branch: "الفرع",
        selectBranch: "اختر الفرع",
        name: "اسم الحلقة",
        namePlaceholder: "مثال: حلقة الفجر",
        code: "رمز الحلقة",
        codePlaceholder: "مثال: FAJR_01",
        codeHint: "أحرف إنجليزية كبيرة وأرقام وشرطة سفلية (_) فقط.",
        schedule: "توقيت الحلقة",
        schedulePlaceholder: "مثال: 05:30 - 06:30", studyDays: "أيام الدراسة", selectDays: "حدد أيام الدراسة", startTime: "من الساعة", endTime: "إلى الساعة", duwamNote: "الحلقات التي تتشارك أيام الدراسة ووقت البداية والنهاية تُجمع تلقائيًا ضمن الدوام نفسه.", days: ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
        optional: "اختياري",
        status: "الحالة",
        save: "حفظ الحلقة",
        saving: "جارٍ الحفظ...",
        cancel: "إلغاء",
        loadingBranches: "جارٍ تحميل الفروع...",
        branchLoadError: "تعذر تحميل فروع المدرسة حاليًا.",
        retry: "إعادة المحاولة",
        requiredBranch: "الفرع مطلوب.",
        requiredName: "اسم الحلقة مطلوب.",
        nameLength: "يجب أن يتراوح اسم الحلقة بين حرفين و150 حرفًا.",
        requiredCode: "رمز الحلقة مطلوب.",
        invalidCode: "استخدم أحرفًا إنجليزية كبيرة وأرقامًا وشرطة سفلية فقط.",
        missingSchool: "تعذر تحديد المدرسة الحالية.",
        success: "تمت إضافة الحلقة بنجاح",
      },
      en: {
        title: "Add a New Class",
        subtitle: "Enter the class details and assign it to a school branch.",
        school: "School",
        branch: "Branch",
        selectBranch: "Select a branch",
        name: "Class name",
        namePlaceholder: "Example: Fajr Class",
        code: "Class code",
        codePlaceholder: "Example: FAJR_01",
        codeHint: "Uppercase English letters, numbers, and underscores (_) only.",
        schedule: "Class schedule",
        schedulePlaceholder: "Example: 05:30 - 06:30", studyDays: "Study days", selectDays: "Choose study days", startTime: "Start time", endTime: "End time", duwamNote: "Classes with the same study days and start/end times are automatically grouped into one duwam.", days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        optional: "Optional",
        status: "Status",
        save: "Save Class",
        saving: "Saving...",
        cancel: "Cancel",
        loadingBranches: "Loading branches...",
        branchLoadError: "School branches could not be loaded right now.",
        retry: "Try again",
        requiredBranch: "Branch is required.",
        requiredName: "Class name is required.",
        nameLength: "Class name must be between 2 and 150 characters.",
        requiredCode: "Class code is required.",
        invalidCode: "Use uppercase English letters, numbers, and underscores only.",
        missingSchool: "The current school could not be identified.",
        success: "Class added successfully",
      },
    }),
    []
  );
  const t = content[language];

  const loadBranches = useCallback(async () => {
    if (!school?.id) {
      setIsLoadingBranches(false);
      setBranchLoadError(true);
      return;
    }

    setIsLoadingBranches(true);
    setBranchLoadError(false);

    try {
      const branchRows = await fetchSchoolBranches(school.id, {
        activeOnly: true,
      });
      setBranches(branchRows);
      setFormData(current => {
        if (current.branchId || branchRows.length === 0) return current;
        const defaultBranch = branchRows.find(branch => branch.is_main);
        return {
          ...current,
          branchId: (defaultBranch ?? branchRows[0]).id,
        };
      });
    } catch {
      setBranchLoadError(true);
    } finally {
      setIsLoadingBranches(false);
    }
  }, [school?.id]);

  useEffect(() => {
    void loadBranches();
  }, [loadBranches]);

  const updateField = <K extends keyof ClassFormValues>(
    field: K,
    value: ClassFormValues[K]
  ) => {
    setFormData(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: "" }));
  };

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    const name = formData.name.trim();
    const code = normalizeClassCode(formData.code);

    if (!formData.branchId.trim()) nextErrors.branchId = t.requiredBranch;
    if (!name) {
      nextErrors.name = t.requiredName;
    } else if (name.length < 2 || name.length > 150) {
      nextErrors.name = t.nameLength;
    }
    if (!code) {
      nextErrors.code = t.requiredCode;
    } else if (!/^[A-Z0-9_]+$/.test(code)) {
      nextErrors.code = t.invalidCode;
    }
    if ((formData.studyDays.length > 0 || formData.startTime || formData.endTime) && (!formData.studyDays.length || !formData.startTime || !formData.endTime || formData.startTime >= formData.endTime)) {
      nextErrors.schedule = language === "ar" ? "حدد أيام الدراسة ووقت البداية والنهاية الصحيحين." : "Choose study days and valid start/end times.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting || !validate()) return;

    if (!school?.id) {
      toast.error(t.missingSchool);
      return;
    }

    setIsSubmitting(true);
    try {
      await addClass(school.id, formData);
      toast.success(t.success);
      setLocation("/classes");
    } catch (error) {
      toast.error(getClassSaveErrorMessage(error, language));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-[#F8F9FA] p-4 md:p-8"
      dir={direction}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setLocation("/classes")}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              aria-label={language === "ar" ? "العودة" : "Back"}
            >
              <ArrowRight size={20} className="text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-[#2C3E50]">{t.title}</h1>
              <p className="mt-1 text-sm text-gray-500">{t.subtitle}</p>
            </div>
          </div>
        </div>

        <Card className="p-6 md:p-8 border border-gray-100 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="rounded-xl border border-[#C8A26A]/20 bg-[#C8A26A]/5 p-4">
              <p className="text-xs text-gray-500">{t.school}</p>
              <p className="mt-1 font-semibold text-[#2C3E50]">
                {school?.name ?? "—"}
              </p>
            </div>

            {isLoadingBranches ? (
              <div className="rounded-xl border border-gray-100 p-5 text-center text-sm text-gray-500">
                <RefreshCw className="mx-auto mb-2 animate-spin" size={20} />
                {t.loadingBranches}
              </div>
            ) : branchLoadError ? (
              <div className="rounded-xl border border-red-100 p-5 text-center">
                <p className="text-sm text-red-700 mb-3">{t.branchLoadError}</p>
                <Button type="button" variant="outline" onClick={() => void loadBranches()}>
                  <RefreshCw size={16} />
                  {t.retry}
                </Button>
              </div>
            ) : (
              <div>
                <label htmlFor="branchId" className="block text-sm font-medium text-[#2C3E50] mb-2">
                  {t.branch} <span className="text-red-500">*</span>
                </label>
                <select
                  id="branchId"
                  value={formData.branchId}
                  onChange={event => updateField("branchId", event.target.value)}
                  className="w-full h-11 rounded-lg border border-gray-200 px-3 text-sm bg-white text-[#2C3E50]"
                >
                  <option value="">{t.selectBranch}</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
                {errors.branchId && <p className="mt-1 text-xs text-red-600">{errors.branchId}</p>}
              </div>
            )}

            <div>
              <label htmlFor="className" className="block text-sm font-medium text-[#2C3E50] mb-2">
                {t.name} <span className="text-red-500">*</span>
              </label>
              <Input
                id="className"
                value={formData.name}
                onChange={event => updateField("name", event.target.value)}
                placeholder={t.namePlaceholder}
                maxLength={150}
                className="h-11"
              />
              {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
            </div>

            <div>
              <label htmlFor="classCode" className="block text-sm font-medium text-[#2C3E50] mb-2">
                {t.code} <span className="text-red-500">*</span>
              </label>
              <Input
                id="classCode"
                value={formData.code}
                onChange={event => updateField("code", event.target.value.toUpperCase())}
                placeholder={t.codePlaceholder}
                autoCapitalize="characters"
                spellCheck={false}
                dir="ltr"
                className="h-11 font-mono text-left"
              />
              <p className="mt-1 text-xs text-gray-500">{t.codeHint}</p>
              {errors.code && <p className="mt-1 text-xs text-red-600">{errors.code}</p>}
            </div>

            <div>
              <label htmlFor="scheduleLabel" className="block text-sm font-medium text-[#2C3E50] mb-2">
                {t.schedule} <span className="text-xs font-normal text-gray-400">({t.optional})</span>
              </label>
              <Input
                id="scheduleLabel"
                value={formData.scheduleLabel}
                onChange={event => updateField("scheduleLabel", event.target.value)}
                placeholder={t.schedulePlaceholder}
                className="h-11"
              />
            </div>

            <section className="space-y-4 rounded-xl border border-[#DCE8E0] bg-[#F7FAF8] p-4">
              <div><h2 className="text-sm font-bold text-[#173B2D]">{t.studyDays}</h2><p className="mt-1 text-xs text-gray-500">{t.duwamNote}</p></div>
              <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-4"><legend className="sr-only">{t.selectDays}</legend>
                {STUDY_DAY_KEYS.map((day, index) => <label key={day} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-3 text-sm"><input type="checkbox" checked={formData.studyDays.includes(day)} onChange={event => updateField("studyDays", event.target.checked ? [...formData.studyDays, day] : formData.studyDays.filter(item => item !== day))} className="size-4 accent-[#0B4738]" /><span>{t.days[index]}</span></label>)}
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="startTime" className="mb-2 block text-sm font-medium text-[#2C3E50]">{t.startTime}</label><Input id="startTime" type="time" value={formData.startTime} onChange={event => updateField("startTime", event.target.value)} className="h-11" dir="ltr" /></div><div><label htmlFor="endTime" className="mb-2 block text-sm font-medium text-[#2C3E50]">{t.endTime}</label><Input id="endTime" type="time" value={formData.endTime} min={formData.startTime || undefined} onChange={event => updateField("endTime", event.target.value)} className="h-11" dir="ltr" /></div></div>
              {errors.schedule && <p className="text-xs text-red-600">{errors.schedule}</p>}
            </section>

            <div>
              <label htmlFor="classStatus" className="block text-sm font-medium text-[#2C3E50] mb-2">
                {t.status}
              </label>
              <select
                id="classStatus"
                value={formData.status}
                onChange={event => updateField("status", event.target.value as ClassStatus)}
                className="w-full h-11 rounded-lg border border-gray-200 px-3 text-sm bg-white text-[#2C3E50]"
              >
                {statusOptions.map(status => (
                  <option key={status} value={status}>
                    {translateClassStatus(status, language)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation("/classes")}
                disabled={isSubmitting}
              >
                {t.cancel}
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || isLoadingBranches || branchLoadError}
                className="gap-2 bg-[#0B4738] text-white hover:bg-[#08382d]"
              >
                {isSubmitting ? (
                  <RefreshCw className="animate-spin" size={16} />
                ) : (
                  <Check size={16} />
                )}
                {isSubmitting ? t.saving : t.save}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default AddClassForm;
