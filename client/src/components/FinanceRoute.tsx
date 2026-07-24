import { Redirect } from "wouter";
import type { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";

export default function FinanceRoute({ children }: { children: ReactNode }) {
  const {
    session,
    school,
    loading,
    authorizationLoading,
    authorizationError,
  } = useAuth();

  if (loading || authorizationLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-[#F8F9FA] text-[#2C3E50]"
        dir="rtl"
      >
        <div className="flex items-center gap-3" role="status">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#0B4738]/30 border-t-[#0B4738]" />
          <span className="text-sm font-medium">
            جارٍ التحقق من صلاحيات الحساب...
          </span>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Redirect to="/login" />;
  }

  if (!school || authorizationError) {
    return (
      <main
        className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-4"
        dir="rtl"
      >
        <section
          role="alert"
          className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-8 text-center shadow-lg"
        >
          <h1 className="text-xl font-bold text-[#2C3E50]">
            تعذر تحديد نطاق المالية
          </h1>
          <p className="mt-3 text-sm leading-7 text-red-700">
            {authorizationError ?? "تعذر تحديد المدرسة الحالية."}
          </p>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
