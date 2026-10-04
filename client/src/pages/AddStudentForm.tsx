import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  AlertTriangle,
  ImagePlus,
  Printer,
  X,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
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
import { toast } from "sonner";

interface FormData {
  // Step 1: Basic
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: StudentGender | "";
  nationalId: string;
  // Step 2: Contact & Education
  phone: string;
  email: string;
  address: string;
  previousSchool: string;
  educationLevel: EducationLevel | "";
  educationYear: string;
  // Step 3: Guardian
  guardianName: string;
  guardianRelation: GuardianRelation | "";
  guardianPhone: string;
  guardianEmail: string;
  guardianJob: string;
  // Step 4: Class
  branchId: string;
  classId: string;
  startDate: string;
  // Step 5: Documents
  birthCertificate: boolean;
  photos: boolean;
  medicalReport: boolean;
  previousCertificate: boolean;
}

const AddStudentForm: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const { locale: language, direction } = useLocale();
  const [isDirty, setIsDirty] = useState(false);
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(true);
  const [isLoadingClasses, setIsLoadingClasses] = useState(false);
  const [branchLoadError, setBranchLoadError] = useState(false);
  const [classLoadError, setClassLoadError] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { school } = useAuth();

  const [formData, setFormData] = useState<FormData>({
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
    startDate: "",
    birthCertificate: false,
    photos: false,
    medicalReport: false,
    previousCertificate: false,
  });

  const photoPreview = useMemo(
    () => (photoFile ? URL.createObjectURL(photoFile) : null),
    [photoFile]
  );

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const content = {
    ar: {
      title: "إضافة طالب جديد",
      printPaperForm: "طباعة استمارة ورقية فارغة",
      steps: [
        "البيانات الأساسية والصورة",
        "الاتصال والتعليم",
        "ولي الأمر",
        "الحلقة",
        "المستندات",
        "المراجعة والتأكيد",
      ],
      stepOf: "الخطوة",
      of: "من",
      next: "التالي",
      previous: "السابق",
      save: "حفظ وتأكيد",
      saving: "جارٍ الحفظ...",
      back: "العودة للطلاب",
      required: "هذا الحقل مطلوب",
      leaveTitle: "تنبيه",
      leaveMessage: "لديك بيانات غير محفوظة. هل تريد المغادرة؟",
      leaveConfirm: "نعم، غادر",
      leaveCancel: "ابقَ هنا",
      optional: "اختياري",
      firstName: "الاسم الأول",
      lastName: "اسم العائلة",
      birthDate: "تاريخ الميلاد",
      gender: "الجنس",
      male: "ذكر",
      female: "أنثى",
      nationalId: "رقم الهوية",
      studentPhoto: "صورة الطالب",
      photoHelp: "صورة خاصة غير عامة. JPG أو PNG أو WebP بحد أقصى 5MB.",
      choosePhoto: "اختيار صورة",
      removePhoto: "إزالة الصورة",
      noPhoto: "غير مرفقة",
      phone: "رقم الهاتف",
      email: "البريد الإلكتروني",
      address: "العنوان",
      previousSchool: "المؤسسة التعليمية / السابقة",
      educationLevel: "المرحلة الدراسية",
      educationYear: "السنة الدراسية",
      primary: "ابتدائي",
      middle: "متوسط",
      secondary: "ثانوي",
      university: "جامعي",
      selectEducation: "غير محدد",
      selectYear: "اختر السنة",
      selectStageFirst: "اختر المرحلة أولًا",
      guardianName: "اسم ولي الأمر",
      guardianRelation: "صلة القرابة",
      guardianPhone: "هاتف ولي الأمر",
      guardianEmail: "بريد ولي الأمر",
      guardianJob: "مهنة ولي الأمر",
      father: "أب",
      mother: "أم",
      brother: "أخ",
      sister: "أخت",
      uncle: "عم",
      aunt: "عمة أو خالة",
      grandfather: "جد",
      grandmother: "جدة",
      other: "أخرى",
      branch: "الفرع",
      className: "الحلقة",
      schedule: "توقيت الحلقة",
      startDate: "تاريخ البدء",
      noClass: "بدون حلقة",
      noClasses: "لا توجد حلقات نشطة في هذا الفرع",
      loadingBranches: "جارٍ تحميل الفروع...",
      loadingClasses: "جارٍ تحميل الحلقات...",
      branchLoadError: "تعذر تحميل الفروع النشطة.",
      classLoadError: "تعذر تحميل حلقات الفرع.",
      retry: "إعادة المحاولة",
      birthCertificate: "شهادة الميلاد",
      photos: "صور شخصية ورقية / إضافية",
      medicalReport: "تقرير طبي",
      previousCertificate: "شهادة مدرسية سابقة",
      reviewTitle: "مراجعة البيانات",
      basicInfo: "البيانات الأساسية",
      contactInfo: "معلومات الاتصال والتعليم",
      guardianInfo: "معلومات ولي الأمر",
      classInfo: "معلومات الحلقة",
      documentsInfo: "المستندات",
      provided: "مقدم",
      notProvided: "غير مقدم",
      photoSavedStudent: "تم حفظ الطالب، لكن تعذر رفع الصورة.",
    },
    en: {
      title: "Add New Student",
      printPaperForm: "Print blank paper form",
      steps: [
        "Basic Info & Photo",
        "Contact & Education",
        "Guardian",
        "Class",
        "Documents",
        "Review & Confirm",
      ],
      stepOf: "Step",
      of: "of",
      next: "Next",
      previous: "Previous",
      save: "Save & Confirm",
      saving: "Saving...",
      back: "Back to Students",
      required: "This field is required",
      leaveTitle: "Warning",
      leaveMessage: "You have unsaved changes. Do you want to leave?",
      leaveConfirm: "Yes, leave",
      leaveCancel: "Stay here",
      optional: "Optional",
      firstName: "First Name",
      lastName: "Last Name",
      birthDate: "Birth Date",
      gender: "Gender",
      male: "Male",
      female: "Female",
      nationalId: "National ID",
      studentPhoto: "Student Photo",
      photoHelp: "Private photo, not public. JPG, PNG or WebP, maximum 5MB.",
      choosePhoto: "Choose photo",
      removePhoto: "Remove photo",
      noPhoto: "Not attached",
      phone: "Phone",
      email: "Email",
      address: "Address",
      previousSchool: "School / Previous School",
      educationLevel: "Education Stage",
      educationYear: "Education Year",
      primary: "Primary",
      middle: "Middle school",
      secondary: "Secondary",
      university: "University",
      selectEducation: "Not specified",
      selectYear: "Choose year",
      selectStageFirst: "Choose stage first",
      guardianName: "Guardian Name",
      guardianRelation: "Relation",
      guardianPhone: "Guardian Phone",
      guardianEmail: "Guardian Email",
      guardianJob: "Guardian Job",
      father: "Father",
      mother: "Mother",
      brother: "Brother",
      sister: "Sister",
      uncle: "Uncle",
      aunt: "Aunt",
      grandfather: "Grandfather",
      grandmother: "Grandmother",
      other: "Other",
      branch: "Branch",
      className: "Class",
      schedule: "Schedule",
      startDate: "Start Date",
      noClass: "No class",
      noClasses: "No active classes in this branch",
      loadingBranches: "Loading branches...",
      loadingClasses: "Loading classes...",
      branchLoadError: "Active branches could not be loaded.",
      classLoadError: "Branch classes could not be loaded.",
      retry: "Try again",
      birthCertificate: "Birth Certificate",
      photos: "Paper / Additional Photos",
      medicalReport: "Medical Report",
      previousCertificate: "Previous Certificate",
      reviewTitle: "Review Data",
      basicInfo: "Basic Information",
      contactInfo: "Contact & Education",
      guardianInfo: "Guardian Information",
      classInfo: "Class Information",
      documentsInfo: "Documents",
      provided: "Provided",
      notProvided: "Not provided",
      photoSavedStudent: "The student was saved, but the photo upload failed.",
    },
  };

  const t = content[language];
  const totalSteps = 6;
  const educationYearOptions = getEducationYearOptions(formData.educationLevel);

  const loadBranches = async () => {
    if (!school?.id) {
      setIsLoadingBranches(false);
      setBranchLoadError(true);
      return;
    }

    setIsLoadingBranches(true);
    setBranchLoadError(false);

    try {
      const branchRows = await fetchBranches(school.id);
      setBranches(branchRows);

      const mainBranch = branchRows.find(branch => branch.is_main);
      if (mainBranch) {
        setFormData(previous =>
          previous.branchId
            ? previous
            : { ...previous, branchId: mainBranch.id, classId: "" }
        );
      }
    } catch {
      setBranchLoadError(true);
    } finally {
      setIsLoadingBranches(false);
    }
  };

  useEffect(() => {
    void loadBranches();
  }, [school?.id]);

  useEffect(() => {
    if (!school?.id || !formData.branchId) {
      setClasses([]);
      setClassLoadError(false);
      setIsLoadingClasses(false);
      return;
    }

    let active = true;
    setIsLoadingClasses(true);
    setClassLoadError(false);

    void fetchClasses(school.id, formData.branchId)
      .then(classRows => {
        if (active) setClasses(classRows);
      })
      .catch(() => {
        if (active) {
          setClasses([]);
          setClassLoadError(true);
        }
      })
      .finally(() => {
        if (active) setIsLoadingClasses(false);
      });

    return () => {
      active = false;
    };
  }, [formData.branchId, school?.id]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const updateField = (field: keyof FormData, value: string | boolean) => {
    setFormData(prev => {
      if (field === "branchId") {
        return { ...prev, branchId: value as string, classId: "" };
      }
      if (field === "educationLevel") {
        return {
          ...prev,
          educationLevel: value as EducationLevel | "",
          educationYear: "",
        };
      }
      return { ...prev, [field]: value };
    });
    setIsDirty(true);
    if (errors[field]) {
      setErrors(prev => {
        const n = { ...prev };
        delete n[field];
        return n;
      });
    }
  };

  const selectPhoto = (file: File | null) => {
    if (!file) return;
    const validationError = validateStudentPhoto(file);
    if (validationError) {
      setPhotoFile(null);
      setPhotoError(validationError);
      return;
    }
    setPhotoFile(file);
    setPhotoError(null);
    setIsDirty(true);
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};
    if (step === 1) {
      if (!formData.firstName.trim()) newErrors.firstName = t.required;
      if (!formData.lastName.trim()) newErrors.lastName = t.required;
      if (!formData.birthDate) newErrors.birthDate = t.required;
      if (!formData.gender) newErrors.gender = t.required;
      if (photoError) newErrors.photo = photoError;
    } else if (step === 2) {
      if (formData.educationLevel && !formData.educationYear) {
        newErrors.educationYear = t.required;
      }
    } else if (step === 3) {
      if (!formData.guardianName.trim()) newErrors.guardianName = t.required;
      if (!formData.guardianRelation)
        newErrors.guardianRelation = t.required;
      if (!formData.guardianPhone.trim())
        newErrors.guardianPhone = t.required;
    } else if (step === 4) {
      if (!formData.branchId) newErrors.branchId = t.required;
      if (!formData.startDate) newErrors.startDate = t.required;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, totalSteps));
    }
  };

  const handlePrevious = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    if (!school?.id) {
      toast.error("تعذر حفظ بيانات الطالب حاليًا.");
      return;
    }

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
          setIsDirty(false);
          toast.warning(
            `${t.photoSavedStudent} ${getStudentSaveErrorMessage(error)}`
          );
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

  const handleBack = () => {
    if (isDirty) {
      setShowLeaveWarning(true);
    } else {
      setLocation("/students");
    }
  };

  const renderField = (
    label: string,
    field: keyof FormData,
    type: string = "text",
    placeholder?: string,
    required = true
  ) => (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-[#2C3E50]">
        {label}
        {required ? (
          <span className="text-red-500 mr-1">*</span>
        ) : (
          <span className="text-gray-400 mr-2 text-xs">({t.optional})</span>
        )}
      </label>
      <Input
        type={type}
        value={formData[field] as string}
        onChange={e => updateField(field, e.target.value)}
        placeholder={placeholder || label}
        className={`h-11 ${type === "date" ? "text-left" : ""} ${errors[field] ? "border-red-400 focus:ring-red-400" : ""}`}
      />
      {errors[field] && (
        <p className="text-xs text-red-500 mt-1">{errors[field]}</p>
      )}
    </div>
  );

  const renderSelect = (
    label: string,
    field: keyof FormData,
    options: { value: string; label: string }[],
    required = true,
    disabled = false,
    emptyLabel = label
  ) => (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-[#2C3E50]">
        {label}
        {required ? (
          <span className="text-red-500 mr-1">*</span>
        ) : (
          <span className="text-gray-400 mr-2 text-xs">({t.optional})</span>
        )}
      </label>
      <select
        value={formData[field] as string}
        onChange={e => updateField(field, e.target.value)}
        disabled={disabled}
        className={`w-full h-11 rounded-lg border px-3 text-sm bg-white text-[#2C3E50] text-right disabled:bg-gray-100 disabled:text-gray-400 ${errors[field] ? "border-red-400" : "border-gray-200"}`}
      >
        <option value="">{emptyLabel}</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {errors[field] && (
        <p className="text-xs text-red-500 mt-1">{errors[field]}</p>
      )}
    </div>
  );

  const selectedBranch = branches.find(
    branch => branch.id === formData.branchId
  );
  const selectedClass = classes.find(
    classItem => classItem.id === formData.classId
  );
  const educationOptions = [
    { value: "primary", label: t.primary },
    { value: "middle", label: t.middle },
    { value: "secondary", label: t.secondary },
    { value: "university", label: t.university },
  ];

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-5">
            <h3 className="text-lg font-bold text-[#2C3E50]">{t.steps[0]}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderField(t.firstName, "firstName")}
              {renderField(t.lastName, "lastName")}
            </div>
            {renderField(t.birthDate, "birthDate", "date")}
            {renderSelect(t.gender, "gender", [
              { value: "male", label: t.male },
              { value: "female", label: t.female },
            ])}
            {renderField(t.nationalId, "nationalId", "text", undefined, false)}

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-gray-200 bg-white">
                  {photoPreview ? (
                    <img
                      src={photoPreview}
                      alt={t.studentPhoto}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImagePlus className="h-8 w-8 text-gray-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#2C3E50]">
                    {t.studentPhoto}
                    <span className="text-gray-400 mr-2 text-xs">({t.optional})</span>
                  </p>
                  <p className="mt-1 text-xs leading-5 text-gray-500">{t.photoHelp}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg bg-[#0B4738] px-3 py-2 text-sm font-medium text-white">
                      <ImagePlus size={16} />
                      {t.choosePhoto}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={event => selectPhoto(event.target.files?.[0] ?? null)}
                      />
                    </label>
                    {photoFile && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setPhotoFile(null);
                          setPhotoError(null);
                        }}
                      >
                        <X size={16} />
                        {t.removePhoto}
                      </Button>
                    )}
                  </div>
                  {photoError && (
                    <p className="mt-2 text-xs text-red-500">{photoError}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-5">
            <h3 className="text-lg font-bold text-[#2C3E50]">{t.steps[1]}</h3>
            {renderField(t.phone, "phone", "tel", undefined, false)}
            {renderField(t.email, "email", "email", undefined, false)}
            {renderField(t.address, "address", "text", undefined, false)}
            {renderField(
              t.previousSchool,
              "previousSchool",
              "text",
              undefined,
              false
            )}
            {renderSelect(
              t.educationLevel,
              "educationLevel",
              educationOptions,
              false,
              false,
              t.selectEducation
            )}
            {renderSelect(
              t.educationYear,
              "educationYear",
              educationYearOptions.map(year => ({
                value: String(year),
                label: language === "ar" ? `السنة ${year}` : `Year ${year}`,
              })),
              Boolean(formData.educationLevel),
              !formData.educationLevel,
              formData.educationLevel ? t.selectYear : t.selectStageFirst
            )}
          </div>
        );
      case 3:
        return (
          <div className="space-y-5">
            <h3 className="text-lg font-bold text-[#2C3E50]">{t.steps[2]}</h3>
            {renderField(t.guardianName, "guardianName")}
            {renderSelect(t.guardianRelation, "guardianRelation", [
              { value: "father", label: t.father },
              { value: "mother", label: t.mother },
              { value: "brother", label: t.brother },
              { value: "sister", label: t.sister },
              { value: "uncle", label: t.uncle },
              { value: "aunt", label: t.aunt },
              { value: "grandfather", label: t.grandfather },
              { value: "grandmother", label: t.grandmother },
              { value: "other", label: t.other },
            ])}
            {renderField(t.guardianPhone, "guardianPhone", "tel")}
            {renderField(
              t.guardianEmail,
              "guardianEmail",
              "email",
              undefined,
              false
            )}
            {renderField(t.guardianJob, "guardianJob", "text", undefined, false)}
          </div>
        );
      case 4:
        return (
          <div className="space-y-5">
            <h3 className="text-lg font-bold text-[#2C3E50]">{t.steps[3]}</h3>
            {renderSelect(
              t.branch,
              "branchId",
              branches.map(branch => ({ value: branch.id, label: branch.name })),
              true,
              isLoadingBranches || branchLoadError,
              isLoadingBranches ? t.loadingBranches : t.branch
            )}
            {branchLoadError && (
              <div className="flex items-center justify-between gap-3 text-sm text-red-600">
                <span>{t.branchLoadError}</span>
                <Button variant="outline" size="sm" onClick={() => void loadBranches()}>
                  {t.retry}
                </Button>
              </div>
            )}
            {renderSelect(
              t.className,
              "classId",
              classes.map(classItem => ({
                value: classItem.id,
                label: classItem.name,
              })),
              false,
              !formData.branchId || isLoadingClasses || classLoadError,
              isLoadingClasses
                ? t.loadingClasses
                : classes.length === 0 && formData.branchId
                  ? t.noClasses
                  : t.noClass
            )}
            {classLoadError && (
              <p className="text-sm text-red-600">{t.classLoadError}</p>
            )}
            {selectedClass?.schedule_label && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                <span className="font-medium">{t.schedule}:</span>{" "}
                {selectedClass.schedule_label}
              </div>
            )}
            {renderField(t.startDate, "startDate", "date")}
          </div>
        );
      case 5:
        return (
          <div className="space-y-5">
            <h3 className="text-lg font-bold text-[#2C3E50]">{t.steps[4]}</h3>
            <div className="space-y-3">
              {[
                {
                  field: "birthCertificate" as keyof FormData,
                  label: t.birthCertificate,
                },
                { field: "photos" as keyof FormData, label: t.photos },
                {
                  field: "medicalReport" as keyof FormData,
                  label: t.medicalReport,
                },
                {
                  field: "previousCertificate" as keyof FormData,
                  label: t.previousCertificate,
                },
              ].map(doc => (
                <label
                  key={doc.field}
                  className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={formData[doc.field] as boolean}
                    onChange={e => updateField(doc.field, e.target.checked)}
                    className="w-5 h-5 rounded border-gray-300 text-[#0B4738] focus:ring-[#0B4738]"
                  />
                  <span className="text-sm font-medium text-[#2C3E50]">
                    {doc.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      case 6:
        return (
          <div className="space-y-5">
            <h3 className="text-lg font-bold text-[#2C3E50]">
              {t.reviewTitle}
            </h3>
            <div className="p-4 bg-[#0B4738]/5 rounded-lg border border-[#0B4738]/10">
              <h4 className="font-semibold text-[#0B4738] mb-3 text-sm">
                {t.basicInfo}
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">{t.firstName}:</span>{" "}
                  <span className="font-medium text-[#2C3E50]">
                    {formData.firstName || "-"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">{t.lastName}:</span>{" "}
                  <span className="font-medium text-[#2C3E50]">
                    {formData.lastName || "-"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">{t.birthDate}:</span>{" "}
                  <span className="font-medium text-[#2C3E50]">
                    {formData.birthDate || "-"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">{t.gender}:</span>{" "}
                  <span className="font-medium text-[#2C3E50]">
                    {formData.gender === "male"
                      ? t.male
                      : formData.gender === "female"
                        ? t.female
                        : "-"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">{t.studentPhoto}:</span>{" "}
                  <span className="font-medium text-[#2C3E50]">
                    {photoFile?.name || t.noPhoto}
                  </span>
                </div>
              </div>
            </div>
            <div className="p-4 bg-[#C8A26A]/5 rounded-lg border border-[#C8A26A]/10">
              <h4 className="font-semibold text-[#C8A26A] mb-3 text-sm">
                {t.contactInfo}
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">{t.phone}:</span>{" "}
                  <span className="font-medium text-[#2C3E50]">
                    {formData.phone || "-"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">{t.email}:</span>{" "}
                  <span className="font-medium text-[#2C3E50]">
                    {formData.email || "-"}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500">{t.educationLevel}:</span>{" "}
                  <span className="font-medium text-[#2C3E50]">
                    {formatEducation(
                      formData.educationLevel || null,
                      formData.educationYear ? Number(formData.educationYear) : null,
                      language
                    )}
                  </span>
                </div>
              </div>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h4 className="font-semibold text-gray-700 mb-3 text-sm">
                {t.guardianInfo}
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">{t.guardianName}:</span>{" "}
                  <span className="font-medium text-[#2C3E50]">
                    {formData.guardianName || "-"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">{t.guardianPhone}:</span>{" "}
                  <span className="font-medium text-[#2C3E50]">
                    {formData.guardianPhone || "-"}
                  </span>
                </div>
              </div>
            </div>
            <div className="p-4 bg-[#0B4738]/5 rounded-lg border border-[#0B4738]/10">
              <h4 className="font-semibold text-[#0B4738] mb-3 text-sm">
                {t.classInfo}
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">{t.branch}:</span>{" "}
                  <span className="font-medium text-[#2C3E50]">
                    {selectedBranch?.name || "-"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">{t.className}:</span>{" "}
                  <span className="font-medium text-[#2C3E50]">
                    {selectedClass?.name || t.noClass}
                  </span>
                </div>
              </div>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h4 className="font-semibold text-gray-700 mb-3 text-sm">
                {t.documentsInfo}
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  {t.birthCertificate}:{" "}
                  <span
                    className={
                      formData.birthCertificate
                        ? "text-[#0B4738] font-medium"
                        : "text-red-500"
                    }
                  >
                    {formData.birthCertificate ? t.provided : t.notProvided}
                  </span>
                </div>
                <div>
                  {t.photos}:{" "}
                  <span
                    className={
                      formData.photos || photoFile
                        ? "text-[#0B4738] font-medium"
                        : "text-red-500"
                    }
                  >
                    {formData.photos || photoFile ? t.provided : t.notProvided}
                  </span>
                </div>
                <div>
                  {t.medicalReport}:{" "}
                  <span
                    className={
                      formData.medicalReport
                        ? "text-[#0B4738] font-medium"
                        : "text-red-500"
                    }
                  >
                    {formData.medicalReport ? t.provided : t.notProvided}
                  </span>
                </div>
                <div>
                  {t.previousCertificate}:{" "}
                  <span
                    className={
                      formData.previousCertificate
                        ? "text-[#0B4738] font-medium"
                        : "text-red-500"
                    }
                  >
                    {formData.previousCertificate ? t.provided : t.notProvided}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div
      className="min-h-screen bg-[#F8F9FA] p-4 md:p-8"
      dir={direction}
    >
      {showLeaveWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="text-[#C8A26A]" size={24} />
              <h3 className="font-bold text-[#2C3E50]">{t.leaveTitle}</h3>
            </div>
            <p className="text-gray-600 text-sm mb-6">{t.leaveMessage}</p>
            <div className="flex gap-3">
              <Button
                onClick={() => {
                  setShowLeaveWarning(false);
                  setLocation("/students");
                }}
                variant="outline"
                className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
              >
                {t.leaveConfirm}
              </Button>
              <Button
                onClick={() => setShowLeaveWarning(false)}
                className="flex-1 text-white"
                style={{ backgroundColor: "#0B4738" }}
              >
                {t.leaveCancel}
              </Button>
            </div>
          </Card>
        </div>
      )}

      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              aria-label={t.back}
            >
              <ArrowRight size={20} className="text-gray-600" />
            </button>
            <h1 className="text-2xl font-bold text-[#2C3E50]">{t.title}</h1>
          </div>
          <Button type="button" variant="outline" onClick={() => setLocation("/students/registration-form")} className="gap-2">
            <Printer size={16} />{t.printPaperForm}
          </Button>
        </div>

        <div className="flex items-center justify-center gap-1 md:gap-2">
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map(step => (
            <React.Fragment key={step}>
              <div
                className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                  step < currentStep
                    ? "bg-[#0B4738] text-white"
                    : step === currentStep
                      ? "bg-[#C8A26A] text-white shadow-md"
                      : "bg-gray-200 text-gray-500"
                }`}
              >
                {step < currentStep ? <Check size={16} /> : step}
              </div>
              {step < totalSteps && (
                <div
                  className={`w-6 md:w-10 h-1 rounded-full transition-all duration-300 ${step < currentStep ? "bg-[#0B4738]" : "bg-gray-200"}`}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        <p className="text-center text-sm text-gray-500">
          {t.stepOf} {currentStep} {t.of} {totalSteps}:{" "}
          <span className="font-medium text-[#2C3E50]">
            {t.steps[currentStep - 1]}
          </span>
        </p>

        <Card className="p-6 md:p-8 border border-gray-100 shadow-sm">
          {renderStep()}
        </Card>

        <div className="flex items-center justify-between">
          <Button
            onClick={handlePrevious}
            disabled={currentStep === 1}
            variant="outline"
            className="flex items-center gap-2 border-gray-300 text-gray-600 disabled:opacity-40"
          >
            <ArrowRight size={16} />
            {t.previous}
          </Button>

          {currentStep < totalSteps ? (
            <Button
              onClick={handleNext}
              className="flex items-center gap-2 text-white font-medium shadow-md hover:shadow-lg transition-all active:scale-[0.97]"
              style={{ backgroundColor: "#0B4738" }}
            >
              {t.next}
              <ArrowLeft size={16} />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex items-center gap-2 text-white font-medium shadow-md hover:shadow-lg transition-all active:scale-[0.97]"
              style={{ backgroundColor: "#0B4738" }}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  {t.saving}
                </span>
              ) : (
                <>
                  <Check size={16} />
                  {t.save}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddStudentForm;
