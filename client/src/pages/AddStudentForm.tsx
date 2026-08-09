import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ImagePlus, X } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import {
  addStudent,
  fetchBranches,
  fetchClasses,
  formatEducation,
  getEducationYearOptions,
  getStudentSaveErrorMessage,
  uploadStudentPhoto,
  validateStudentPhoto,
  type BranchOption,
  type ClassOption,
  type EducationLevel,
  type GuardianRelation,
  type StudentGender,
} from "@/lib/students";

type FormData = {
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: StudentGender | "";
  nationalId: string;
  phone: string;
  email: string;
  address: string;
  previousSchool: string;
  educationLevel: EducationLevel | "";
  educationYear: string;
  guardianName: string;
  guardianRelation: GuardianRelation | "";
  guardianPhone: string;
  guardianEmail: string;
  guardianJob: string;
  branchId: string;
  classId: string;
  startDate: string;
  birthCertificate: boolean;
  photos: boolean;
  medicalReport: boolean;
  previousCertificate: boolean;
};

const initialForm: FormData = {
  firstName: "",
  lastName: "",
  birthDate: "",
  gender: "",
  nationalId: "",
  phone: "",
  email: "",
  address: "",
  previousSchool: "",
  educationLevel: "",
  educationYear: "",
  guardianName: "",
  guardianRelation: "",
  guardianPhone: "",
  guardianEmail: "",
  guardianJob: "",
  branchId: "",
  classId: "",
  startDate: new Date().toISOString().slice(0, 10),
  birthCertificate: false,
  photos: false,
  medicalReport: false,
  previousCertificate: false,
};

const educationOptions: Array<{ value: EducationLevel; label: string }> = [
  { value: "primary", label: "ابتدائي" },
  { value: "middle", label: "متوسط" },
  { value: "secondary", label: "ثانوي" },
  { value: "university", label: "جامعي" },
];

const guardianOptions: Array<{ value: GuardianRelation; label: string }> = [
  { value: "father", label: "أب" },
  { value: "mother", label: "أم" },
  { value: "brother", label: "أخ" },
  { value: "sister", label: "أخت" },
  { value: "uncle", label: "عم" },
  { value: "aunt", label: "عمة أو خالة" },
  { value: "grandfather", label: "جد" },
  { value: "grandmother", label: "جدة" },
  { value: "other", label: "أخرى" },
];

const steps = [
  "البيانات الأساسية والصورة",
  "الاتصال والتعليم",
  "ولي الأمر",
  "الحلقة",
  "المستندات",
  "المراجعة والتأكيد",
];

export default function AddStudentForm() {
  const [, setLocation] = useLocation();
  const { school } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(true);
  const [isLoadingClasses, setIsLoadingClasses] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const photoPreview = useMemo(
    () => (photoFile ? URL.createObjectURL(photoFile) : null),
    [photoFile]
  );

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  useEffect(() => {
    if (!school?.id) {
      setIsLoadingBranches(false);
      return;
    }

    let active = true;
    setIsLoadingBranches(true);
    void fetchBranches(school.id)
      .then(rows => {
        if (!active) return;
        setBranches(rows);
        const main = rows.find(row => row.is_main) ?? rows[0];
        if (main) {
          setFormData(previous =>
            previous.branchId ? previous : { ...previous, branchId: main.id }
          );
        }
      })
      .catch(() => {
        if (active) toast.error("تعذر تحميل فروع المدرسة.");
      })
      .finally(() => {
        if (active) setIsLoadingBranches(false);
      });

    return () => {
      active = false;
    };
  }, [school?.id]);

  useEffect(() => {
    if (!school?.id || !formData.branchId) {
      setClasses([]);
      return;
    }

    let active = true;
    setIsLoadingClasses(true);
    void fetchClasses(school.id, formData.branchId)
      .then(rows => {
        if (active) setClasses(rows);
      })
      .catch(() => {
        if (active) toast.error("تعذر تحميل حلقات الفرع.");
      })
      .finally(() => {
        if (active) setIsLoadingClasses(false);
      });

    return () => {
      active = false;
    };
  }, [formData.branchId, school?.id]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const updateField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData(previous => {
      if (field === "branchId") {
        return { ...previous, branchId: value as string, classId: "" };
      }
      if (field === "educationLevel") {
        return { ...previous, educationLevel: value as EducationLevel | "", educationYear: "" };
      }
      return { ...previous, [field]: value };
    });
    setIsDirty(true);
    setErrors(previous => {
      if (!previous[field]) return previous;
      const next = { ...previous };
      delete next[field];
      return next;
    });
  };

  const validateStep = (step: number) => {
    const nextErrors: Record<string, string> = {};
    if (step === 1) {
      if (!formData.firstName.trim()) nextErrors.firstName = "هذا الحقل مطلوب";
      if (!formData.lastName.trim()) nextErrors.lastName = "هذا الحقل مطلوب";
      if (!formData.birthDate) nextErrors.birthDate = "هذا الحقل مطلوب";
      if (!formData.gender) nextErrors.gender = "هذا الحقل مطلوب";
      if (photoError) nextErrors.photo = photoError;
    }
    if (step === 2) {
      if (formData.educationLevel && !formData.educationYear) {
        nextErrors.educationYear = "اختر السنة الدراسية.";
      }
      if (!formData.educationLevel && formData.educationYear) {
        nextErrors.educationLevel = "اختر المرحلة الدراسية.";
      }
    }
    if (step === 3) {
      if (!formData.guardianName.trim()) nextErrors.guardianName = "هذا الحقل مطلوب";
      if (!formData.guardianRelation) nextErrors.guardianRelation = "هذا الحقل مطلوب";
      if (!formData.guardianPhone.trim()) nextErrors.guardianPhone = "هذا الحقل مطلوب";
    }
    if (step === 4) {
      if (!formData.branchId) nextErrors.branchId = "هذا الحقل مطلوب";
      if (!formData.startDate) nextErrors.startDate = "هذا الحقل مطلوب";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const selectPhoto = (file: File | null) => {
    if (!file) return;
    const validation = validateStudentPhoto(file);
    if (validation) {
      setPhotoFile(null);
      setPhotoError(validation);
      return;
    }
    setPhotoFile(file);
    setPhotoError(null);
    setIsDirty(true);
  };

  const handleSubmit = async () => {
    if (isSubmitting || !school?.id) return;
    if (!validateStep(6)) return;

    setIsSubmitting(true);
    try {
      const studentId = await addStudent(school.id, {
        branchId: formData.branchId,
        classId: formData.classId,
        firstName: formData.firstName,
        lastName: formData.lastName,
        birthDate: formData.birthDate,
        gender: formData.gender,
        nationalId: formData.nationalId,
        phone: formData.phone,
        email: formData.email,
        address: formData.address,
        previousSchool: formData.previousSchool,
        educationLevel: formData.educationLevel,
        educationYear: formData.educationYear,
        guardianName: formData.guardianName,
        guardianRelation: formData.guardianRelation,
        guardianPhone: formData.guardianPhone,
        guardianEmail: formData.guardianEmail,
        guardianJob: formData.guardianJob,
        startDate: formData.startDate,
        birthCertificateProvided: formData.birthCertificate,
        photosProvided: formData.photos || Boolean(photoFile),
        medicalReportProvided: formData.medicalReport,
        previousCertificateProvided: formData.previousCertificate,
      });

      if (photoFile) {
        try {
          await uploadStudentPhoto(school.id, studentId, photoFile);
        } catch (error) {
          toast.warning(
            `تم حفظ الطالب، لكن تعذر رفع الصورة. ${getStudentSaveErrorMessage(error)}`
          );
          setIsDirty(false);
          setLocation(`/students/${studentId}`);
          return;
        }
      }

      setIsDirty(false);
      toast.success("تمت إضافة الطالب بنجاح.");
      setLocation(`/students/${studentId}`);
    } catch (error) {
      toast.error(getStudentSaveErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const field = (
    label: string,
    name: keyof FormData,
    type = "text",
    required = false
  ) => (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-[#244E3B]">
        {label}{required ? <span className="mr-1 text-red-500">*</span> : null}
      </span>
      <Input
        type={type}
        value={formData[name] as string}
        onChange={event => updateField(name, event.target.value as never)}
        className={errors[name] ? "border-red-400" : ""}
      />
      {errors[name] && <span className="text-xs text-red-600">{errors[name]}</span>}
    </label>
  );

  const select = (
    label: string,
    name: keyof FormData,
    options: Array<{ value: string; label: string }>,
    required = false,
    disabled = false,
    placeholder = "اختر"
  ) => (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-[#244E3B]">
        {label}{required ? <span className="mr-1 text-red-500">*</span> : null}
      </span>
      <select
        value={formData[name] as string}
        onChange={event => updateField(name, event.target.value as never)}
        disabled={disabled}
        className={`h-11 w-full rounded-lg border bg-white px-3 text-sm text-[#244E3B] disabled:bg-gray-100 ${errors[name] ? "border-red-400" : "border-gray-200"}`}
      >
        <option value="">{placeholder}</option>
        {options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {errors[name] && <span className="text-xs text-red-600">{errors[name]}</span>}
    </label>
  );

  const selectedBranch = branches.find(item => item.id === formData.branchId);
  const selectedClass = classes.find(item => item.id === formData.classId);
  const educationYears = getEducationYearOptions(formData.educationLevel);

  const renderStep = () => {
    if (currentStep === 1) {
      return (
        <div className="space-y-5">
          <h2 className="text-lg font-extrabold text-[#173B2D]">البيانات الأساسية وصورة الطالب</h2>
          <div className="flex flex-col gap-4 rounded-2xl border border-[#E1EBE4] bg-[#FAFCFA] p-4 sm:flex-row sm:items-center">
            <div className="grid size-28 shrink-0 place-items-center overflow-hidden rounded-2xl border border-[#D9E7DD] bg-white">
              {photoPreview ? (
                <img src={photoPreview} alt="معاينة صورة الطالب" className="h-full w-full object-cover" />
              ) : (
                <ImagePlus className="size-9 text-[#7B9183]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[#244E3B]">صورة الطالب</p>
              <p className="mt-1 text-xs leading-6 text-[#718377]">
                اختيارية، خاصة وغير عامة. JPG أو PNG أو WebP بحد أقصى 5MB.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl bg-[#17663B] px-4 py-2 text-sm font-bold text-white">
                  <ImagePlus className="size-4" />
                  اختيار صورة
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={event => selectPhoto(event.target.files?.[0] ?? null)}
                  />
                </label>
                {photoFile && (
                  <Button type="button" variant="outline" onClick={() => { setPhotoFile(null); setPhotoError(null); }}>
                    <X className="size-4" /> إزالة
                  </Button>
                )}
              </div>
              {photoError && <p className="mt-2 text-xs font-semibold text-red-600">{photoError}</p>}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("الاسم الأول", "firstName", "text", true)}
            {field("اسم العائلة", "lastName", "text", true)}
            {field("تاريخ الميلاد", "birthDate", "date", true)}
            {select("الجنس", "gender", [{ value: "male", label: "ذكر" }, { value: "female", label: "أنثى" }], true)}
            {field("رقم الهوية", "nationalId")}
          </div>
        </div>
      );
    }

    if (currentStep === 2) {
      return (
        <div className="space-y-5">
          <h2 className="text-lg font-extrabold text-[#173B2D]">الاتصال والمستوى التعليمي</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("رقم الهاتف", "phone", "tel")}
            {field("البريد الإلكتروني", "email", "email")}
            {field("العنوان", "address")}
            {field("المؤسسة التعليمية / السابقة", "previousSchool")}
            {select("المرحلة الدراسية", "educationLevel", educationOptions, false, false, "غير محدد")}
            {select(
              "السنة الدراسية",
              "educationYear",
              educationYears.map(year => ({ value: String(year), label: `السنة ${year}` })),
              Boolean(formData.educationLevel),
              !formData.educationLevel,
              formData.educationLevel ? "اختر السنة" : "اختر المرحلة أولًا"
            )}
          </div>
          <p className="rounded-xl bg-[#EEF6F0] px-4 py-3 text-sm text-[#37634D]">
            التصنيف يدعم: ابتدائي (1–5)، متوسط (1–4)، ثانوي (1–3)، جامعي (1–10).
          </p>
        </div>
      );
    }

    if (currentStep === 3) {
      return (
        <div className="space-y-5">
          <h2 className="text-lg font-extrabold text-[#173B2D]">بيانات ولي الأمر</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("اسم ولي الأمر", "guardianName", "text", true)}
            {select("صلة القرابة", "guardianRelation", guardianOptions, true)}
            {field("هاتف ولي الأمر", "guardianPhone", "tel", true)}
            {field("بريد ولي الأمر", "guardianEmail", "email")}
            {field("مهنة ولي الأمر", "guardianJob")}
          </div>
        </div>
      );
    }

    if (currentStep === 4) {
      return (
        <div className="space-y-5">
          <h2 className="text-lg font-extrabold text-[#173B2D]">الفرع والحلقة</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {select(
              "الفرع",
              "branchId",
              branches.map(item => ({ value: item.id, label: item.name })),
              true,
              isLoadingBranches,
              isLoadingBranches ? "جارٍ تحميل الفروع..." : "اختر الفرع"
            )}
            {select(
              "الحلقة",
              "classId",
              classes.map(item => ({ value: item.id, label: item.name })),
              false,
              !formData.branchId || isLoadingClasses,
              isLoadingClasses ? "جارٍ تحميل الحلقات..." : "بدون حلقة"
            )}
            {field("تاريخ بدء الدراسة", "startDate", "date", true)}
          </div>
          {selectedClass?.schedule_label && (
            <p className="rounded-xl bg-[#F7F9F7] px-4 py-3 text-sm text-[#607368]">
              توقيت الحلقة: <strong>{selectedClass.schedule_label}</strong>
            </p>
          )}
        </div>
      );
    }

    if (currentStep === 5) {
      const documents: Array<[keyof FormData, string]> = [
        ["birthCertificate", "شهادة الميلاد"],
        ["photos", "صور شخصية ورقية / إضافية"],
        ["medicalReport", "تقرير طبي"],
        ["previousCertificate", "شهادة مدرسية سابقة"],
      ];
      return (
        <div className="space-y-5">
          <h2 className="text-lg font-extrabold text-[#173B2D]">المستندات المستلمة</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {documents.map(([name, label]) => (
              <label key={name} className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <input
                  type="checkbox"
                  checked={formData[name] as boolean}
                  onChange={event => updateField(name, event.target.checked as never)}
                  className="size-5"
                />
                <span className="text-sm font-semibold text-[#244E3B]">{label}</span>
              </label>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <h2 className="text-lg font-extrabold text-[#173B2D]">مراجعة البيانات</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <ReviewCard title="الطالب">
            <p>{formData.firstName} {formData.lastName}</p>
            <p>{formData.birthDate}</p>
            <p>{formData.gender === "male" ? "ذكر" : "أنثى"}</p>
            <p>الصورة: {photoFile ? photoFile.name : "غير مرفقة"}</p>
          </ReviewCard>
          <ReviewCard title="التعليم">
            <p>{formatEducation(formData.educationLevel || null, formData.educationYear ? Number(formData.educationYear) : null)}</p>
            <p>{formData.previousSchool || "المؤسسة غير محددة"}</p>
          </ReviewCard>
          <ReviewCard title="ولي الأمر">
            <p>{formData.guardianName}</p>
            <p>{formData.guardianPhone}</p>
          </ReviewCard>
          <ReviewCard title="الحلقة">
            <p>{selectedBranch?.name ?? "—"}</p>
            <p>{selectedClass?.name ?? "بدون حلقة"}</p>
          </ReviewCard>
        </div>
      </div>
    );
  };

  const handleBack = () => {
    if (!isDirty || window.confirm("لديك بيانات غير محفوظة. هل تريد المغادرة؟")) {
      setLocation("/students");
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAF8] p-4 md:p-8" dir="rtl">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="icon" onClick={handleBack} aria-label="العودة">
            <ArrowRight className="size-5" />
          </Button>
          <div>
            <p className="text-xs font-bold text-[#648071]">الطلاب</p>
            <h1 className="text-2xl font-extrabold text-[#173B2D]">إضافة طالب جديد</h1>
          </div>
        </header>

        <div className="flex items-center justify-center gap-1 sm:gap-2" aria-label="خطوات التسجيل">
          {steps.map((label, index) => {
            const step = index + 1;
            return (
              <React.Fragment key={label}>
                <span
                  title={label}
                  className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-extrabold ${step < currentStep ? "bg-[#17663B] text-white" : step === currentStep ? "bg-[#C8A26A] text-white" : "bg-gray-200 text-gray-500"}`}
                >
                  {step < currentStep ? <Check className="size-4" /> : step}
                </span>
                {step < steps.length && <span className={`h-1 w-5 rounded-full sm:w-10 ${step < currentStep ? "bg-[#17663B]" : "bg-gray-200"}`} />}
              </React.Fragment>
            );
          })}
        </div>
        <p className="text-center text-sm font-semibold text-[#607368]">
          الخطوة {currentStep} من {steps.length}: {steps[currentStep - 1]}
        </p>

        <Card className="border border-[#E4ECE6] p-5 shadow-sm sm:p-7">
          {renderStep()}
        </Card>

        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setCurrentStep(step => Math.max(1, step - 1))}
            disabled={currentStep === 1 || isSubmitting}
          >
            <ArrowRight className="size-4" /> السابق
          </Button>
          {currentStep < steps.length ? (
            <Button
              type="button"
              className="bg-[#17663B] text-white hover:bg-[#125331]"
              onClick={() => {
                if (validateStep(currentStep)) setCurrentStep(step => Math.min(steps.length, step + 1));
              }}
            >
              التالي <ArrowLeft className="size-4" />
            </Button>
          ) : (
            <Button
              type="button"
              className="bg-[#17663B] text-white hover:bg-[#125331]"
              onClick={() => void handleSubmit()}
              disabled={isSubmitting}
            >
              <Check className="size-4" />
              {isSubmitting ? "جارٍ الحفظ..." : "حفظ الطالب"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#E1EBE4] bg-[#FAFCFA] p-4 text-sm leading-7 text-[#526B5D]">
      <h3 className="mb-2 font-extrabold text-[#17663B]">{title}</h3>
      {children}
    </div>
  );
}