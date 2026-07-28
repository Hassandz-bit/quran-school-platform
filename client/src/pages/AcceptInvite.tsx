import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchMyTeacherInvitationContext,
  markMyTeacherInvitationAccepted,
  type TeacherInvitationContext,
} from "@/lib/teacher-invitations";
import {
  clearTeacherInviteSession,
  hasTeacherInviteSession,
} from "@/lib/invite-session";

type PageState =
  | "checking"
  | "ready"
  | "invalid"
  | "submitting"
  | "accepted_with_warning";

export default function AcceptInvite() {
  const [, setLocation] = useLocation();
  const {
    session,
    loading,
    updateUser,
    reloadAuthorization,
  } = useAuth();
  const [state, setState] = useState<PageState>("checking");
  const [context, setContext] = useState<TeacherInvitationContext | null>(null);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (loading) return () => {
      cancelled = true;
    };
    if (!session || !hasTeacherInviteSession()) {
      setState("invalid");
      return () => {
        cancelled = true;
      };
    }

    setState("checking");
    void fetchMyTeacherInvitationContext()
      .then(result => {
        if (cancelled) return;
        if (!result || result.status !== "sent") {
          setState("invalid");
          return;
        }
        setContext(result);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("invalid");
      });
    return () => {
      cancelled = true;
    };
  }, [loading, session]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state === "submitting") return;
    setErrorMessage("");

    if (password.length < 8) {
      setErrorMessage("يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.");
      return;
    }
    if (password !== passwordConfirmation) {
      setErrorMessage("كلمتا المرور غير متطابقتين.");
      return;
    }

    setState("submitting");
    const { error } = await updateUser({ password });
    if (error) {
      setErrorMessage("تعذر تعيين كلمة المرور. قد يكون رابط الدعوة منتهيًا أو غير صالح.");
      setState("ready");
      return;
    }

    const accepted = await markMyTeacherInvitationAccepted();
    clearTeacherInviteSession();
    await reloadAuthorization();

    if (!accepted) {
      setPassword("");
      setPasswordConfirmation("");
      setState("accepted_with_warning");
      return;
    }

    setLocation("/dashboard");
  };

  if (loading || state === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0B4738] p-4" dir="rtl">
        <section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl" role="status">
          <Loader2 className="mx-auto mb-3 animate-spin text-[#0B4738]" />
          <p className="text-sm text-gray-600">جارٍ التحقق من رابط الدعوة...</p>
        </section>
      </main>
    );
  }

  if (state === "invalid" || !session || !context) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0B4738] p-4" dir="rtl">
        <section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
          <ShieldAlert className="mx-auto mb-4 text-red-700" size={42} />
          <h1 className="text-xl font-bold text-[#2C3E50]">رابط الدعوة غير صالح</h1>
          <p role="alert" className="mt-3 text-sm leading-7 text-red-700">
            رابط الدعوة منتهي أو غير صالح، أو لا توجد جلسة دعوة موثقة. لن يظهر نموذج كلمة المرور.
          </p>
          <Button type="button" onClick={() => setLocation("/login")} className="mt-6 w-full bg-[#0B4738] text-white">
            العودة إلى تسجيل الدخول
          </Button>
        </section>
      </main>
    );
  }

  if (state === "accepted_with_warning") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0B4738] p-4" dir="rtl">
        <section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
          <CheckCircle2 className="mx-auto mb-4 text-emerald-700" size={42} />
          <h1 className="text-xl font-bold text-[#2C3E50]">تم تعيين كلمة المرور</h1>
          <p className="mt-3 text-sm leading-7 text-amber-800">
            حُفظت كلمة المرور الجديدة، لكن تعذر تحديث حالة سجل الدعوة. يمكنك متابعة الدخول، وسيُراجع السجل بصورة مستقلة دون إعادة كلمة المرور.
          </p>
          <Button type="button" onClick={() => setLocation("/dashboard")} className="mt-6 w-full bg-[#0B4738] text-white">
            الانتقال إلى لوحة التحكم
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0B4738] p-4" dir="rtl">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <header className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#0B4738] text-2xl font-bold text-[#C8A26A]">ق</div>
          <h1 className="text-2xl font-bold text-[#2C3E50]">قبول دعوة المعلم</h1>
          <p className="mt-2 text-sm text-gray-500">عيّن كلمة مرور قوية لإكمال الدخول.</p>
        </header>

        <dl className="mb-6 space-y-2 rounded-xl bg-gray-50 p-4 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-gray-500">المدرسة</dt><dd className="font-semibold text-[#2C3E50]">{context.schoolName}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-gray-500">المعلم</dt><dd className="font-semibold text-[#2C3E50]">{context.teacherName}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-gray-500">الفرع</dt><dd className="font-semibold text-[#2C3E50]">{context.branchName}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-gray-500">الدور</dt><dd className="font-semibold text-[#0B4738]">المعلم</dd></div>
        </dl>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">كلمة المرور</span>
            <Input type="password" value={password} minLength={8} required autoComplete="new-password" disabled={state === "submitting"} onChange={event => setPassword(event.target.value)} />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">تأكيد كلمة المرور</span>
            <Input type="password" value={passwordConfirmation} minLength={8} required autoComplete="new-password" disabled={state === "submitting"} onChange={event => setPasswordConfirmation(event.target.value)} />
          </label>
          {errorMessage && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errorMessage}</p>}
          <Button type="submit" disabled={state === "submitting"} className="h-12 w-full bg-[#0B4738] text-base font-semibold text-white">
            {state === "submitting" ? <><Loader2 size={17} className="animate-spin" /> جارٍ إكمال الدعوة...</> : "حفظ كلمة المرور والدخول"}
          </Button>
        </form>
      </section>
    </main>
  );
}
