import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowRight, ArrowLeft, Check, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";

interface FormData {
  // Step 1: Basic
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  nationalId: string;
  // Step 2: Contact & Education
  phone: string;
  email: string;
  address: string;
  previousSchool: string;
  educationLevel: string;
  // Step 3: Guardian
  guardianName: string;
  guardianRelation: string;
  guardianPhone: string;
  guardianEmail: string;
  guardianJob: string;
  // Step 4: Class
  branch: string;
  className: string;
  schedule: string;
  startDate: string;
  // Step 5: Documents
  birthCertificate: boolean;
  photos: boolean;
  medicalReport: boolean;
  previousCertificate: boolean;
}

const AddStudentForm: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const [isDirty, setIsDirty] = useState(false);
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [, setLocation] = useLocation();

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
    guardianName: "",
    guardianRelation: "",
    guardianPhone: "",
    guardianEmail: "",
    guardianJob: "",
    branch: "",
    className: "",
    schedule: "",
    startDate: "",
    birthCertificate: false,
    photos: false,
    medicalReport: false,
    previousCertificate: false,
  });

  const content = {
    ar: {
      title: "إضافة طالب جديد",
      steps: [
        "البيانات الأساسية",
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
      successMessage: "تم حفظ بيانات الطالب بنجاح (تجريبي)",
      // Step 1
      firstName: "الاسم الأول",
      lastName: "اسم العائلة",
      birthDate: "تاريخ الميلاد",
      gender: "الجنس",
      male: "ذكر",
      female: "أنثى",
      nationalId: "رقم الهوية",
      // Step 2
      phone: "رقم الهاتف",
      email: "البريد الإلكتروني",
      address: "العنوان",
      previousSchool: "المدرسة السابقة",
      educationLevel: "المستوى التعليمي",
      // Step 3
      guardianName: "اسم ولي الأمر",
      guardianRelation: "صلة القرابة",
      guardianPhone: "هاتف ولي الأمر",
      guardianEmail: "بريد ولي الأمر",
      guardianJob: "مهنة ولي الأمر",
      father: "أب",
      mother: "أم",
      brother: "أخ",
      uncle: "عم",
      other: "أخرى",
      // Step 4
      branch: "الفرع",
      className: "الحلقة",
      schedule: "التوقيت",
      startDate: "تاريخ البدء",
      mainBranch: "الفرع الرئيسي",
      eastBranch: "فرع الشرق",
      westBranch: "فرع الغرب",
      fajrCircle: "حلقة الفجر",
      asrCircle: "حلقة العصر",
      maghribCircle: "حلقة المغرب",
      morning: "صباحي",
      evening: "مسائي",
      // Step 5
      birthCertificate: "شهادة الميلاد",
      photos: "صور شخصية",
      medicalReport: "تقرير طبي",
      previousCertificate: "شهادة مدرسية سابقة",
      // Step 6
      reviewTitle: "مراجعة البيانات",
      basicInfo: "البيانات الأساسية",
      contactInfo: "معلومات الاتصال",
      guardianInfo: "معلومات ولي الأمر",
      classInfo: "معلومات الحلقة",
      documentsInfo: "المستندات",
      provided: "مقدم",
      notProvided: "غير مقدم",
    },
    en: {
      title: "Add New Student",
      steps: [
        "Basic Info",
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
      successMessage: "Student data saved successfully (demo)",
      firstName: "First Name",
      lastName: "Last Name",
      birthDate: "Birth Date",
      gender: "Gender",
      male: "Male",
      female: "Female",
      nationalId: "National ID",
      phone: "Phone",
      email: "Email",
      address: "Address",
      previousSchool: "Previous School",
      educationLevel: "Education Level",
      guardianName: "Guardian Name",
      guardianRelation: "Relation",
      guardianPhone: "Guardian Phone",
      guardianEmail: "Guardian Email",
      guardianJob: "Guardian Job",
      father: "Father",
      mother: "Mother",
      brother: "Brother",
      uncle: "Uncle",
      other: "Other",
      branch: "Branch",
      className: "Class",
      schedule: "Schedule",
      startDate: "Start Date",
      mainBranch: "Main Branch",
      eastBranch: "East Branch",
      westBranch: "West Branch",
      fajrCircle: "Fajr Circle",
      asrCircle: "Asr Circle",
      maghribCircle: "Maghrib Circle",
      morning: "Morning",
      evening: "Evening",
      birthCertificate: "Birth Certificate",
      photos: "Personal Photos",
      medicalReport: "Medical Report",
      previousCertificate: "Previous Certificate",
      reviewTitle: "Review Data",
      basicInfo: "Basic Information",
      contactInfo: "Contact Information",
      guardianInfo: "Guardian Information",
      classInfo: "Class Information",
      documentsInfo: "Documents",
      provided: "Provided",
      notProvided: "Not provided",
    },
  };

  const t = content[language];
  const totalSteps = 6;

  // Warn on page leave
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
    setFormData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
    if (errors[field]) {
      setErrors(prev => {
        const n = { ...prev };
        delete n[field];
        return n;
      });
    }
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};
    if (step === 1) {
      if (!formData.firstName) newErrors.firstName = t.required;
      if (!formData.lastName) newErrors.lastName = t.required;
      if (!formData.birthDate) newErrors.birthDate = t.required;
      if (!formData.gender) newErrors.gender = t.required;
    } else if (step === 2) {
      if (!formData.phone) newErrors.phone = t.required;
    } else if (step === 3) {
      if (!formData.guardianName) newErrors.guardianName = t.required;
      if (!formData.guardianPhone) newErrors.guardianPhone = t.required;
    } else if (step === 4) {
      if (!formData.branch) newErrors.branch = t.required;
      if (!formData.className) newErrors.className = t.required;
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
    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsSubmitting(false);
    setIsDirty(false);
    alert(t.successMessage);
    setLocation("/students");
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
    placeholder?: string
  ) => (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-[#2C3E50]">
        {label}
        <span className="text-red-500 mr-1">*</span>
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
    options: { value: string; label: string }[]
  ) => (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-[#2C3E50]">
        {label}
        <span className="text-red-500 mr-1">*</span>
      </label>
      <select
        value={formData[field] as string}
        onChange={e => updateField(field, e.target.value)}
        className={`w-full h-11 rounded-lg border px-3 text-sm bg-white text-[#2C3E50] text-right ${errors[field] ? "border-red-400" : "border-gray-200"}`}
      >
        <option value="">{label}</option>
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
            {renderField(t.nationalId, "nationalId")}
          </div>
        );
      case 2:
        return (
          <div className="space-y-5">
            <h3 className="text-lg font-bold text-[#2C3E50]">{t.steps[1]}</h3>
            {renderField(t.phone, "phone", "tel")}
            {renderField(t.email, "email", "email")}
            {renderField(t.address, "address")}
            {renderField(t.previousSchool, "previousSchool")}
            {renderField(t.educationLevel, "educationLevel")}
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
              { value: "uncle", label: t.uncle },
              { value: "other", label: t.other },
            ])}
            {renderField(t.guardianPhone, "guardianPhone", "tel")}
            {renderField(t.guardianEmail, "guardianEmail", "email")}
            {renderField(t.guardianJob, "guardianJob")}
          </div>
        );
      case 4:
        return (
          <div className="space-y-5">
            <h3 className="text-lg font-bold text-[#2C3E50]">{t.steps[3]}</h3>
            {renderSelect(t.branch, "branch", [
              { value: "main", label: t.mainBranch },
              { value: "east", label: t.eastBranch },
              { value: "west", label: t.westBranch },
            ])}
            {renderSelect(t.className, "className", [
              { value: "fajr", label: t.fajrCircle },
              { value: "asr", label: t.asrCircle },
              { value: "maghrib", label: t.maghribCircle },
            ])}
            {renderSelect(t.schedule, "schedule", [
              { value: "morning", label: t.morning },
              { value: "evening", label: t.evening },
            ])}
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
            {/* Basic Info */}
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
              </div>
            </div>
            {/* Contact */}
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
              </div>
            </div>
            {/* Guardian */}
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
            {/* Class */}
            <div className="p-4 bg-[#0B4738]/5 rounded-lg border border-[#0B4738]/10">
              <h4 className="font-semibold text-[#0B4738] mb-3 text-sm">
                {t.classInfo}
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">{t.branch}:</span>{" "}
                  <span className="font-medium text-[#2C3E50]">
                    {formData.branch || "-"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">{t.className}:</span>{" "}
                  <span className="font-medium text-[#2C3E50]">
                    {formData.className || "-"}
                  </span>
                </div>
              </div>
            </div>
            {/* Documents */}
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
                      formData.photos
                        ? "text-[#0B4738] font-medium"
                        : "text-red-500"
                    }
                  >
                    {formData.photos ? t.provided : t.notProvided}
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
      dir={language === "ar" ? "rtl" : "ltr"}
    >
      {/* Leave Warning Modal */}
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <ArrowRight size={20} className="text-gray-600" />
            </button>
            <h1 className="text-2xl font-bold text-[#2C3E50]">{t.title}</h1>
          </div>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setLanguage("ar")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${language === "ar" ? "bg-[#0B4738] text-white shadow-sm" : "text-gray-600"}`}
            >
              العربية
            </button>
            <button
              onClick={() => setLanguage("en")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${language === "en" ? "bg-[#0B4738] text-white shadow-sm" : "text-gray-600"}`}
            >
              English
            </button>
          </div>
        </div>

        {/* Step Indicator */}
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

        {/* Step Label */}
        <p className="text-center text-sm text-gray-500">
          {t.stepOf} {currentStep} {t.of} {totalSteps}:{" "}
          <span className="font-medium text-[#2C3E50]">
            {t.steps[currentStep - 1]}
          </span>
        </p>

        {/* Form Content */}
        <Card className="p-6 md:p-8 border border-gray-100 shadow-sm">
          {renderStep()}
        </Card>

        {/* Navigation Buttons */}
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
