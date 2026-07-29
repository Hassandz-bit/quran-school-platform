import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MailPlus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchEligibleTeacherInvitations,
  fetchTeacherInvitationAccess,
  getTeacherInvitationErrorMessage,
  inviteExistingTeacher,
  isTeacherInvitationEmailValid,
  normalizeTeacherInvitationEmail,
  TeacherInvitationError,
  type EligibleTeacherInvitation,
} from "@/lib/teacher-invitations";

type DialogState =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "permission_denied"
  | "success"
  | "error";

export default function TeacherInvitationDialog({
  onInvitationSent,
}: {
  onInvitationSent?: () => void | Promise<void>;
}) {
  const { school } = useAuth();
  const [canInvite, setCanInvite] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DialogState>("idle");
  const [teachers, setTeachers] = useState<EligibleTeacherInvitation[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionLock = useRef(false);
  const idempotencyKey = useRef<string | null>(null);

  const selectedTeacher = useMemo(
    () => teachers.find(teacher => teacher.teacherId === selectedTeacherId) ?? null,
    [selectedTeacherId, teachers]
  );

  useEffect(() => {
    let cancelled = false;
    if (!school?.id) {
      setCanInvite(false);
      setAccessChecked(true);
      return () => {
        cancelled = true;
      };
    }
    setAccessChecked(false);
    void fetchTeacherInvitationAccess(school.id)
      .then(access => {
        if (!cancelled) setCanInvite(access.canInvite);
      })
      .catch(() => {
        if (!cancelled) setCanInvite(false);
      })
      .finally(() => {
        if (!cancelled) setAccessChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [school?.id]);

  const loadEligibleTeachers = useCallback(async () => {
    if (!school?.id) return;
    setState("loading");
    setErrorMessage("");
    try {
      const result = await fetchEligibleTeacherInvitations(school.id);
      setTeachers(result);
      if (result.length === 0) {
        setSelectedTeacherId("");
        setState("empty");
        return;
      }
      const first = result[0];
      setSelectedTeacherId(first.teacherId);
      setEmail(first.existingEmail ?? "");
      setState("ready");
    } catch (error) {
      if (error instanceof TeacherInvitationError && error.code === "not_authorized") {
        setCanInvite(false);
        setState("permission_denied");
        return;
      }
      setState("error");
      setErrorMessage("تعذر تحميل المعلمين المؤهلين للدعوة.");
    }
  }, [school?.id]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (isSubmitting) return;
    setOpen(nextOpen);
    if (nextOpen) {
      idempotencyKey.current = null;
      setEmailError("");
      setErrorMessage("");
      void loadEligibleTeachers();
    } else {
      setState("idle");
      submissionLock.current = false;
    }
  };

  const handleTeacherChange = (teacherId: string) => {
    setSelectedTeacherId(teacherId);
    const teacher = teachers.find(item => item.teacherId === teacherId);
    setEmail(teacher?.existingEmail ?? "");
    setEmailError("");
    setErrorMessage("");
    idempotencyKey.current = null;
  };

  const handleSubmit = async () => {
    if (submissionLock.current || isSubmitting || !school?.id || !selectedTeacher) {
      return;
    }
    const normalizedEmail = normalizeTeacherInvitationEmail(email);
    if (!normalizedEmail) {
      setEmailError("البريد مطلوب لإرسال الدعوة.");
      return;
    }
    if (!isTeacherInvitationEmailValid(normalizedEmail)) {
      setEmailError("أدخل بريدًا إلكترونيًا صالحًا.");
      return;
    }

    submissionLock.current = true;
    setIsSubmitting(true);
    setEmailError("");
    setErrorMessage("");
    idempotencyKey.current ??= crypto.randomUUID();

    try {
      await inviteExistingTeacher(
        {
          schoolId: school.id,
          teacherId: selectedTeacher.teacherId,
          email: normalizedEmail,
        },
        idempotencyKey.current
      );
      setTeachers(current =>
        current.filter(teacher => teacher.teacherId !== selectedTeacher.teacherId)
      );
      setState("success");
      await onInvitationSent?.();
    } catch (error) {
      const code =
        error instanceof TeacherInvitationError
          ? error.code
          : "provisioning_failed";
      setErrorMessage(getTeacherInvitationErrorMessage(code));
      if (code === "not_authorized") {
        setCanInvite(false);
        setState("permission_denied");
      } else {
        setState("ready");
      }
      if (code !== "provisioning_failed") idempotencyKey.current = null;
    } finally {
      submissionLock.current = false;
      setIsSubmitting(false);
    }
  };

  if (!accessChecked || !canInvite) return null;

  return (
    <>
      <Button
        type="button"
        onClick={() => handleOpenChange(true)}
        className="bg-[#C8A26A] font-semibold text-[#173B31] hover:bg-[#D7B782]"
      >
        <MailPlus size={16} />
        دعوة معلم
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" dir="rtl">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle>دعوة معلم موجود</DialogTitle>
            <DialogDescription className="leading-6">
              سيستخرج الخادم دور المعلم وفرعه واسمه من السجل الموجود، ولن تحفظ
              الواجهة البريد مباشرة.
            </DialogDescription>
          </DialogHeader>

          {state === "loading" && (
            <div className="flex items-center justify-center gap-3 py-10" role="status">
              <Loader2 className="animate-spin text-[#0B4738]" />
              <span className="text-sm text-gray-600">جارٍ تحميل المعلمين المؤهلين...</span>
            </div>
          )}

          {state === "empty" && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
              <p className="font-semibold text-[#2C3E50]">لا يوجد معلم مؤهل للدعوة</p>
              <p className="mt-2 text-sm leading-6 text-gray-500">
                يظهر هنا فقط المعلم النشط غير المربوط بحساب ودون دعوة نشطة.
              </p>
            </div>
          )}

          {state === "permission_denied" && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              لا تملك الصلاحيات الثلاث المطلوبة لإرسال دعوة معلم.
            </p>
          )}

          {state === "error" && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p>{errorMessage}</p>
              <Button type="button" variant="outline" className="mt-4" onClick={() => void loadEligibleTeachers()}>
                إعادة المحاولة
              </Button>
            </div>
          )}

          {state === "success" && (
            <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-7 text-emerald-800">
              تم تجهيز الدعوة بأمان. سيختفي المعلم من قائمة المؤهلين، ولا تُرسل
              دعوة أخرى عند إعادة العرض.
            </div>
          )}

          {state === "ready" && selectedTeacher && (
            <div className="space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-700">المعلم</span>
                <select
                  aria-label="المعلم المؤهل"
                  value={selectedTeacherId}
                  disabled={isSubmitting}
                  onChange={event => handleTeacherChange(event.target.value)}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"
                >
                  {teachers.map(teacher => (
                    <option key={teacher.teacherId} value={teacher.teacherId}>
                      {teacher.fullName}
                    </option>
                  ))}
                </select>
              </label>

              <dl className="grid gap-3 rounded-xl bg-gray-50 p-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-gray-500">الفرع</dt>
                  <dd className="mt-1 font-semibold text-[#2C3E50]">{selectedTeacher.branchName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">الدور الثابت</dt>
                  <dd className="mt-1 inline-flex items-center gap-1 font-semibold text-[#0B4738]">
                    <ShieldCheck size={15} /> {selectedTeacher.roleLabel}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs text-gray-500">الحلقات المرتبطة</dt>
                  <dd className="mt-1 font-medium text-gray-700">
                    {selectedTeacher.classNames.length > 0
                      ? selectedTeacher.classNames.join("، ")
                      : "لا توجد حلقة نشطة"}
                  </dd>
                </div>
              </dl>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-700">بريد الدعوة</span>
                <Input
                  type="email"
                  value={email}
                  disabled={isSubmitting}
                  autoComplete="email"
                  placeholder="teacher@example.com"
                  onChange={event => {
                    setEmail(event.target.value);
                    setEmailError("");
                  }}
                />
                {emailError && <p role="alert" className="mt-2 text-xs text-red-700">{emailError}</p>}
                <p className="mt-2 text-xs leading-5 text-gray-500">
                  سترسل الدعوة إلى هذا البريد فقط بعد نجاح Auth والتجهيز الذري.
                </p>
              </label>

              {errorMessage && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {errorMessage}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => handleOpenChange(false)}>
              إغلاق
            </Button>
            {state === "ready" && selectedTeacher && (
              <Button type="button" disabled={isSubmitting} onClick={() => void handleSubmit()} className="bg-[#0B4738] text-white">
                {isSubmitting ? (
                  <><Loader2 size={16} className="animate-spin" /> جارٍ إرسال الدعوة...</>
                ) : (
                  <><MailPlus size={16} /> إرسال الدعوة</>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
