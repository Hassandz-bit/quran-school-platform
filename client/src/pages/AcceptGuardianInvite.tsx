import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import {
  activateGuardianInvitation,
  fetchMyGuardianInvitationContext,
  type GuardianInvitationContext,
} from "@/lib/guardian-invitations";
import {
  clearGuardianInviteSession,
  getGuardianInviteSession,
} from "@/lib/invite-session";

type PageState =
  | "checking"
  | "ready"
  | "activating"
  | "success"
  | "invalid"
  | "error";

export default function AcceptGuardianInvite() {
  const [, setLocation] = useLocation();
  const { session, loading, updateUser } = useAuth();
  const [state, setState] = useState<PageState>("checking");
  const [context, setContext] = useState<GuardianInvitationContext | null>(null);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const autoActivationRef = useRef<string | null>(null);

  const completeActivation = useCallback(async (invitationId: string) => {
    setState("activating");
    const activated = await activateGuardianInvitation(invitationId);
    if (!activated) {
      setErrorMessage(
        "تعذر تفعيل الدعوة. قد تكون منتهية أو ملغاة، أو فُتح الرابط بحساب آخر."
      );
      setState("error");
      return;
    }
    clearGuardianInviteSession();
    setState("success");
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (loading) return () => {
      cancelled = true;
    };

    const invitationId = getGuardianInviteSession();
    if (!session || !invitationId) {
      setState("invalid");
      return () => {
        cancelled = true;
      };
    }

    setState("checking");
    void fetchMyGuardianInvitationContext(invitationId)
      .then(result => {
        if (cancelled) return;
        if (!result) {
          setState("invalid");
          return;
        }
        setContext(result);
        if (result.status === "accepted") {
          clearGuardianInviteSession();
          setState("success");
        } else if (result.requiresPasswordSetup) {
          setState("ready");
        } else if (autoActivationRef.current !== result.invitationId) {
          autoActivationRef.current = result.invitationId;
          void completeActivation(result.invitationId);
        }
      })
      .catch(() => {
        if (!cancelled) setState("invalid");
      });

    return () => {
      cancelled = true;
    };
  }, [completeActivation, loading, session]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!context || state === "activating") return;
    setErrorMessage("");

    if (password.length < 8) {
      setErrorMessage("يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.");
      return;
    }
    if (password !== passwordConfirmation) {
      setErrorMessage("كلمتا المرور غير متطابقتين.");
      return;
    }

    setState("activating");
    const { error } = await updateUser({ password });
    if (error) {
      setErrorMessage("تعذر تعيين كلمة المرور. قد يكون رابط الدعوة غير صالح.");
      setState("ready");
      return;
    }
    await completeActivation(context.invitationId);
  };

  if (loading || state === "checking" || state === "activating") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0B4738] p-4" dir="rtl">
        <section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl" role="status">
          <Loader2 className="mx-auto mb-3 animate-spin text-[#0B4738]" />
          <p className="text-sm text-gray-600">
            {state === "activating" ? "جارٍ تفعيل وصول ولي الأمر..." : "جارٍ التحقق من رابط الدعوة..."}
          </p>
        </section>
      </main>
    );
  }

  if (state === "success") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0B4738] p-4" dir="rtl">
        <section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
          <CheckCircle2 className="mx-auto mb-4 text-emerald-700" size={46} />
          <h1 className="text-xl font-bold text-[#2C3E50]">
            تم تفعيل وصول ولي الأمر بنجاح
          </h1>
          <p className="mt-3 text-sm leading-7 text-gray-600">
            تم ربط الحساب بأمان. ستتاح خدمات بوابة ولي الأمر عند إطلاقها.
          </p>
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
            قد تكون الدعوة منتهية أو ملغاة، أو فُتح الرابط بحساب غير مخصص لها.
          </p>
          <Button type="button" onClick={() => setLocation("/login")} className="mt-6 w-full bg-[#0B4738] text-white">
            العودة إلى تسجيل الدخول
          </Button>
        </section>
      </main>
    );
  }

  if (state === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0B4738] p-4" dir="rtl">
        <section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
          <ShieldAlert className="mx-auto mb-4 text-amber-700" size={42} />
          <h1 className="text-xl font-bold text-[#2C3E50]">تعذر إكمال التفعيل</h1>
          <p role="alert" className="mt-3 text-sm leading-7 text-amber-800">{errorMessage}</p>
          <Button type="button" onClick={() => void completeActivation(context.invitationId)} className="mt-6 w-full bg-[#0B4738] text-white">
            إعادة المحاولة
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
          <h1 className="text-2xl font-bold text-[#2C3E50]">تفعيل حساب ولي الأمر</h1>
          <p className="mt-2 text-sm text-gray-500">عيّن كلمة مرور قوية لإكمال تفعيل الحساب الجديد.</p>
        </header>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">كلمة المرور</span>
            <Input type="password" value={password} minLength={8} required autoComplete="new-password" onChange={event => setPassword(event.target.value)} />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">تأكيد كلمة المرور</span>
            <Input type="password" value={passwordConfirmation} minLength={8} required autoComplete="new-password" onChange={event => setPasswordConfirmation(event.target.value)} />
          </label>
          {errorMessage && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errorMessage}</p>}
          <Button type="submit" className="h-12 w-full bg-[#0B4738] text-base font-semibold text-white">
            حفظ كلمة المرور وتفعيل الوصول
          </Button>
        </form>
      </section>
    </main>
  );
}
