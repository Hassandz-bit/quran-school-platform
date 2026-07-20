import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [, setLocation] = useLocation();
  const { updateUser, loading } = useAuth();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");

    if (password.length < 8) {
      setErrorMessage("يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.");
      return;
    }

    if (password !== passwordConfirmation) {
      setErrorMessage("كلمتا المرور غير متطابقتين.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await updateUser({ password });

      if (error) {
        setErrorMessage(
          "تعذر تغيير كلمة المرور. قد يكون رابط الاستعادة منتهيًا أو غير صالح."
        );
        return;
      }

      setLocation("/dashboard");
    } catch {
      setErrorMessage("تعذر تغيير كلمة المرور حاليًا. حاول مرة أخرى لاحقًا.");
    } finally {
      setIsSubmitting(false);
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
            تعيين كلمة مرور جديدة
          </h1>
          <p className="mt-2 text-sm leading-6 text-gray-500">
            اختر كلمة مرور قوية لا تقل عن 8 أحرف.
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              كلمة المرور الجديدة
            </label>
            <Input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              minLength={8}
              required
              autoComplete="new-password"
              className="h-11 text-base"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              تأكيد كلمة المرور
            </label>
            <Input
              type="password"
              value={passwordConfirmation}
              onChange={event => setPasswordConfirmation(event.target.value)}
              minLength={8}
              required
              autoComplete="new-password"
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

          <Button
            type="submit"
            disabled={loading || isSubmitting}
            className="h-12 w-full rounded-xl bg-[#0B4738] text-base font-semibold text-white"
          >
            {loading || isSubmitting
              ? "جارٍ تحديث كلمة المرور..."
              : "حفظ كلمة المرور"}
          </Button>
        </form>
      </div>
    </div>
  );
}
