import { Redirect } from "wouter";
import type { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";

export default function StaffRoute({ children }: { children: ReactNode }) {
  const {
    session,
    school,
    loading,
    authorizationLoading,
    authorizationError,
    activeRoleCodes,
    isSchoolAdmin,
  } = useAuth();
  const { direction } = useLocale();

  if (loading || authorizationLoading) {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-[#F8F9FA] text-[#2C3E50]"
        dir={direction}
      >
        <div className="flex items-center gap-3" role="status">
          <span className="size-5 animate-spin rounded-full border-2 border-[#0B4738]/30 border-t-[#0B4738]" />
          <span className="text-sm font-medium">
            {direction === "rtl"
              ? "جارٍ التحقق من صلاحيات الحساب..."
              : "Checking account access..."}
          </span>
        </div>
      </main>
    );
  }

  if (!session) return <Redirect to="/login" />;

  if (
    !school ||
    authorizationError ||
    (!isSchoolAdmin && activeRoleCodes.length === 0)
  ) {
    return <Redirect to="/post-login" />;
  }

  return <>{children}</>;
}
