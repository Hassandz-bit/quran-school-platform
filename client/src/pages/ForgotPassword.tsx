import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";

const RECOVERY_COOLDOWN_SECONDS = 60;

function getRecoveryErrorMessage(error: {
  code?: string;
  status?: number;
  message?: string;
}): string {
  const details = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();

  if (
    details.includes("redirect") ||
    details.includes("not allowed") ||
    details.includes("invalid redirect")
  ) {
    return "رابط الموقع غير مضاف في إعدادات Supabase. أضف https://quran-school-platform-livid.vercel.app/reset-password إلى Authentication ثم URL Configuration ثم Redirect URLs.";
  }

  if (error.status === 422 || details.includes("email provider")) {
    return "خدمة البريد في Supabase غير مفعلة حاليًا. فعّل Email Provider ثم أعد المحاولة.";
  }

  return "تعذر إرسال رابط الاستعادة حاليًا. تحقق من البريد وحاول مرة أخرى.";
}

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [, setLocation] = useLocation();
  const { resetPasswordForEmail } = useAuth();

  useEffect(() => {
    if (cooldownSeconds <= 0) return;

    const timer = window.setTimeout(() => {
      setCooldownSeconds(seconds => Math.max(0, seconds - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [cooldownSeconds]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (cooldownSeconds > 0) return;

    setIsLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const { error } = await resetPasswordForEmail(
        email,
        `${window.location.origin}/reset-password`
      );

      if (error) {
        if (error.code === "over_email_send_rate_limit" || error.status === 429) {
          setSuccessMessage(
            "إذا كان البريد مرتبطًا بحساب، فسيصلك رابط لتغيير كلمة المرور."
          );
          setCooldownSeconds(RECOVERY_COOLDOWN_SECONDS);
          return;
        }

        setErrorMessage(getRecoveryErrorMessage(error));
        return;
      }

      setSuccessMessage(
        "إذا كان البريد مرتبطًا بحساب، فسيصلك رابط لتغيير كلمة المرور."
      );
      setCooldownSeconds(RECOVERY_COOLDOWN_SECONDS);
    } catch {
      setErrorMessage(
        "تعذر إرسال رابط الاستعادة حاليًا. حاول مرة أخرى لاحقًا."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-[#0B4738] p-4"
      dir="rtl"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#0B4738] shadow-lg">
            <span className="text-2xl font-bold text-[#C8A26A]">ق</span>
          </div>
          <h1 className="text-2xl font-bold text-[#2C3E50]">
            استعادة كلمة المرور
          </h1>
          <p className="mt-2 text-sm leading-6 text-gray-500">
            أدخل بريد حسابك لإرسال رابط تغيير كلمة المرور.
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              البريد الإلكتروني
            </label>
            <Input
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              required
              autoComplete="email"
              className="h-11 text-base"
            />
          </div>

          {errorMessage && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {errorMessage}
            </p>
          )}

          {successMessage && (
            <p
              role="status"
              className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
            >
              {successMessage}
            </p>
          )}

          <Button
            type="submit"
            disabled={isLoading || cooldownSeconds > 0}
            className="h-12 w-full rounded-xl bg-[#0B4738] text-base font-semibold text-white"
          >
            {isLoading ? "جارٍ الإرسال..." : "إرسال رابط الاستعادة"}
          </Button>

          <button
            type="button"
            onClick={() => setLocation("/login")}
            className="w-full text-sm font-medium text-[#0B4738] hover:text-[#C8A26A]"
          >
            العودة إلى تسجيل الدخول
          </button>
        </form>
      </div>
    </div>
  );
}
