import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, RefreshCw } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import {
  addTeacher,
  fetchTeacherBranches,
  getTeacherSaveErrorMessage,
  translateTeacherGender,
  translateTeacherStatus,
  type TeacherBranch,
  type TeacherFormValues,
  type TeacherGender,
  type TeacherStatus,
} from "@/lib/teachers";

const statusOptions: TeacherStatus[] = [
  "active",
  "inactive",
  "on_leave",
  "archived",
];
const genderOptions: TeacherGender[] = ["male", "female"];

const getLocalDateInputValue = () => {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
};

const AddTeacherForm: React.FC = () => {
  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const [branches, setBranches] = useState<TeacherBranch[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(true);
  const [branchLoadError, setBranchLoadError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<TeacherFormValues>({
    branchId: "",
    firstName: "",
    lastName: "",
    gender: "",
    phone: "",
    email: "",
    specialization: "",
    qualification: "",
    hireDate: getLocalDateInputValue(),
    status: "active",
    notes: "",
  });
  const [, setLocation] = useLocation();
  const { school } = useAuth();

  const content = useMemo(
    () => ({
      ar: {
        title: "إضافة معلم جديد",
        subtitle: "أدخل بيانات المعلم واربطه بأحد فروع المدرسة.",
        school: "المدرسة",
        branch: "الفرع",
        selectBranch: "اختر الفرع",
        firstName: "الاسم",
        firstNamePlaceholder: "مثال: محمد",
        lastName: "اللقب",
        lastNamePlaceholder: "مثال: بن سالم",
        gender: "الجنس",
        selectGender: "اختر الجنس",
        phone: "الهاتف",
        phonePlaceholder: "مثال: 0550000000",
        email: "البريد الإلكتروني",
        emailPlaceholder: "example@email.com",
        specialization: "التخصص",
        specializationPlaceholder: "مثال: تحفيظ القرآن",
        qualification: "المؤهل العلمي",
        qualificationPlaceholder: "مثال: إجازة في القرآن الكريم",
        hireDate: "تاريخ التوظيف",
        status: "الحالة",
        notes: "ملاحظات",
        notesPlaceholder: "أي معلومات إضافية مفيدة...",
        optional: "اختياري",
        save: "حفظ المعلم",
        saving: "جارٍ الحفظ...",
        cancel: "إلغاء",
        loadingBranches: "جارٍ تحميل الفروع...",
        branchLoadError: "تعذر تحميل فروع المدرسة حاليًا.",
        retry: "إعادة المحاولة",
        requiredBranch: "الفرع مطلوب.",
        requiredFirstName: "الاسم مطلوب.",
        firstNameLength: "يجب أن يتراوح الاسم بين حرفين و100 حرف.",
        requiredLastName: "اللقب مطلوب.",
        lastNameLength: "يجب أن يتراوح اللقب بين حرفين و100 حرف.",
        requiredGender: "الجنس مطلوب.",
        invalidEmail: "أدخل بريدًا إلكترونيًا صحيحًا.",
        requiredHireDate: "تاريخ التوظيف مطلوب.",
        missingSchool: "تعذر تحديد المدرسة الحالية.",
        success: "تمت إضافة المعلم بنجاح",
      },
      en: {
        title: "Add a New Teacher",
        subtitle: "Enter the teacher details and assign a school branch.",
        school: "School",
        branch: "Branch",
        selectBranch: "Select a branch",
        firstName: "First name",
        firstNamePlaceholder: "Example: Mohamed",
        lastName: "Last name",
        lastNamePlaceholder: "Example: Ben Salem",
        gender: "Gender",
        selectGender: "Select gender",
        phone: "Phone",
        phonePlaceholder: "Example: 0550000000",
        email: "Email",
        emailPlaceholder: "example@email.com",
        specialization: "Specialization",
        specializationPlaceholder: "Example: Quran memorization",
        qualification: "Qualification",
        qualificationPlaceholder: "Example: Quran certification",
        hireDate: "Hire date",
        status: "Status",
        notes: "Notes",
        notesPlaceholder: "Any useful additional information...",
        optional: "Optional",
        save: "Save Teacher",
        saving: "Saving...",
        cancel: "Cancel",
        loadingBranches: "Loading branches...",
        branchLoadError: "School branches could not be loaded right now.",
        retry: "Try again",
        requiredBranch: "Branch is required.",
        requiredFirstName: "First name is required.",
        firstNameLength: "First name must be between 2 and 100 characters.",
        requiredLastName: "Last name is required.",
        lastNameLength: "Last name must be between 2 and 100 characters.",
        requiredGender: "Gender is required.",
        invalidEmail: "Enter a valid email address.",
        requiredHireDate: "Hire date is required.",
        missingSchool: "The current school could not be identified.",
        success: "Teacher added successfully",
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
      const branchRows = await fetchTeacherBranches(school.id, {
        activeOnly: true,
      });
      setBranches(branchRows);
      setFormData(current => {
        if (current.branchId || branchRows.length === 0) return current;
        const mainBranch = branchRows.find(branch => branch.is_main);
        return {
          ...current,
          branchId: (mainBranch ?? branchRows[0]).id,
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

  const updateField = <K extends keyof TeacherFormValues>(
    field: K,
    value: TeacherFormValues[K]
  ) => {
    setFormData(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: "" }));
  };

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    const firstName = formData.firstName.trim();
    const lastName = formData.lastName.trim();
    const email = formData.email.trim();

    if (!formData.branchId.trim()) nextErrors.branchId = t.requiredBranch;

    if (!firstName) {
      nextErrors.firstName = t.requiredFirstName;
    } else if (firstName.length < 2 || firstName.length > 100) {
      nextErrors.firstName = t.firstNameLength;
    }

    if (!lastName) {
      nextErrors.lastName = t.requiredLastName;
    } else if (lastName.length < 2 || lastName.length > 100) {
      nextErrors.lastName = t.lastNameLength;
    }

    if (!formData.gender) nextErrors.gender = t.requiredGender;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.email = t.invalidEmail;
    }
    if (!formData.hireDate.trim()) nextErrors.hireDate = t.requiredHireDate;

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting || isLoadingBranches || branchLoadError || !validate()) return;

    if (!school?.id) {
      toast.error(t.missingSchool);
      return;
    }

    setIsSubmitting(true);
    try {
      await addTeacher(school.id, formData);
      toast.success(t.success);
      setLocation("/teachers");
    } catch (error) {
      toast.error(getTeacherSaveErrorMessage(error, language));
    } finally {
      setIsSubmitting(false);
    }
  };

  const optionalLabel = (
    <span className="text-xs font-normal text-gray-400">({t.optional})</span>
  );

  return (
    <div
      className="min-h-screen bg-[#F8F9FA] p-4 md:p-8"
      dir={language === "ar" ? "rtl" : "ltr"}
    >
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setLocation("/teachers")}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              aria-label={language === "ar" ? "العودة" : "Back"}
            >
              <ArrowRight
                size={20}
                className={`text-gray-600 ${language === "en" ? "rotate-180" : ""}`}
              />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-[#2C3E50]">{t.title}</h1>
              <p className="mt-1 text-sm text-gray-500">{t.subtitle}</p>
            </div>
          </div>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg self-end sm:self-auto">
            <button
              type="button"
              onClick={() => setLanguage("ar")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${language === "ar" ? "bg-[#0B4738] text-white shadow-sm" : "text-gray-600"}`}
            >
              العربية
            </button>
            <button
              type="button"
              onClick={() => setLanguage("en")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${language === "en" ? "bg-[#0B4738] text-white shadow-sm" : "text-gray-600"}`}
            >
              English
            </button>
          </div>
        </div>

        <Card className="p-6 md:p-8 border border-gray-100 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
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
                {errors.branchId && (
                  <p className="mt-1 text-xs text-red-600">{errors.branchId}</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-[#2C3E50] mb-2">
                  {t.firstName} <span className="text-red-500">*</span>
                </label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={event => updateField("firstName", event.target.value)}
                  placeholder={t.firstNamePlaceholder}
                  maxLength={100}
                  className="h-11"
                />
                {errors.firstName && (
                  <p className="mt-1 text-xs text-red-600">{errors.firstName}</p>
                )}
              </div>

              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-[#2C3E50] mb-2">
                  {t.lastName} <span className="text-red-500">*</span>
                </label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={event => updateField("lastName", event.target.value)}
                  placeholder={t.lastNamePlaceholder}
                  maxLength={100}
                  className="h-11"
                />
                {errors.lastName && (
                  <p className="mt-1 text-xs text-red-600">{errors.lastName}</p>
                )}
              </div>

              <div>
                <label htmlFor="gender" className="block text-sm font-medium text-[#2C3E50] mb-2">
                  {t.gender} <span className="text-red-500">*</span>
                </label>
                <select
                  id="gender"
                  value={formData.gender}
                  onChange={event =>
                    updateField("gender", event.target.value as TeacherGender | "")
                  }
                  className="w-full h-11 rounded-lg border border-gray-200 px-3 text-sm bg-white text-[#2C3E50]"
                >
                  <option value="">{t.selectGender}</option>
                  {genderOptions.map(gender => (
                    <option key={gender} value={gender}>
                      {translateTeacherGender(gender, language)}
                    </option>
                  ))}
                </select>
                {errors.gender && (
                  <p className="mt-1 text-xs text-red-600">{errors.gender}</p>
                )}
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-[#2C3E50] mb-2">
                  {t.phone} {optionalLabel}
                </label>
                <Input
                  id="phone"
                  type="tel"
                  dir="ltr"
                  value={formData.phone}
                  onChange={event => updateField("phone", event.target.value)}
                  placeholder={t.phonePlaceholder}
                  className="h-11 text-left"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-[#2C3E50] mb-2">
                  {t.email} {optionalLabel}
                </label>
                <Input
                  id="email"
                  type="email"
                  dir="ltr"
                  value={formData.email}
                  onChange={event => updateField("email", event.target.value)}
                  placeholder={t.emailPlaceholder}
                  className="h-11 text-left"
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-red-600">{errors.email}</p>
                )}
              </div>

              <div>
                <label htmlFor="specialization" className="block text-sm font-medium text-[#2C3E50] mb-2">
                  {t.specialization} {optionalLabel}
                </label>
                <Input
                  id="specialization"
                  value={formData.specialization}
                  onChange={event => updateField("specialization", event.target.value)}
                  placeholder={t.specializationPlaceholder}
                  className="h-11"
                />
              </div>

              <div>
                <label htmlFor="qualification" className="block text-sm font-medium text-[#2C3E50] mb-2">
                  {t.qualification} {optionalLabel}
                </label>
                <Input
                  id="qualification"
                  value={formData.qualification}
                  onChange={event => updateField("qualification", event.target.value)}
                  placeholder={t.qualificationPlaceholder}
                  className="h-11"
                />
              </div>

              <div>
                <label htmlFor="hireDate" className="block text-sm font-medium text-[#2C3E50] mb-2">
                  {t.hireDate} <span className="text-red-500">*</span>
                </label>
                <Input
                  id="hireDate"
                  type="date"
                  dir="ltr"
                  value={formData.hireDate}
                  onChange={event => updateField("hireDate", event.target.value)}
                  className="h-11 text-left"
                />
                {errors.hireDate && (
                  <p className="mt-1 text-xs text-red-600">{errors.hireDate}</p>
                )}
              </div>

              <div>
                <label htmlFor="teacherStatus" className="block text-sm font-medium text-[#2C3E50] mb-2">
                  {t.status}
                </label>
                <select
                  id="teacherStatus"
                  value={formData.status}
                  onChange={event =>
                    updateField("status", event.target.value as TeacherStatus)
                  }
                  className="w-full h-11 rounded-lg border border-gray-200 px-3 text-sm bg-white text-[#2C3E50]"
                >
                  {statusOptions.map(status => (
                    <option key={status} value={status}>
                      {translateTeacherStatus(status, language)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-[#2C3E50] mb-2">
                {t.notes} {optionalLabel}
              </label>
              <textarea
                id="notes"
                value={formData.notes}
                onChange={event => updateField("notes", event.target.value)}
                placeholder={t.notesPlaceholder}
                rows={4}
                className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-[#2C3E50] outline-none transition focus:border-[#0B4738] focus:ring-2 focus:ring-[#0B4738]/10"
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation("/teachers")}
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

export default AddTeacherForm;
