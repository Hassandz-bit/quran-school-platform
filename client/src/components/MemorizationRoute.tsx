import type { ReactNode } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

export default function MemorizationRoute({
  children,
}: {
  children: ReactNode;
}) {
  const {
    session,
    school,
    loading,
    authorizationLoading,
    authorizationError,
  } = useAuth();

  if (loading || authorizationLoading) {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-[#F8F9FA] p-4 text-[#2C3E50]"
        dir="rtl"
      >
        <div className="flex items-center gap-3" role="status">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#0B4738]/30 border-t-[#0B4738]" />
          <span className="text-sm font-medium">
            جارٍ التحقق من صلاحيات متابعة الحفظ...
          </span>
        </div>
      </main>
    );
  }

  if (!session) return <Redirect to="/login" />;

  if (!school || authorizationError) {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-[#F8F9FA] p-4"
        dir="rtl"
      >
        <section
          role="alert"
          className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-8 text-center shadow-lg"
        >
          <h1 className="text-xl font-bold text-[#2C3E50]">
            تعذر تحديد نطاق متابعة الحفظ
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
