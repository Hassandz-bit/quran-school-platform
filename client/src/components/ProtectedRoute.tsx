import { useState, type ReactNode } from "react";
import { LogOut, ShieldAlert } from "lucide-react";
import { Redirect, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

const DEFAULT_DENIAL_MESSAGE =
  "لا تملك صلاحية الدخول إلى لوحة إدارة المدرسة.";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const {
    session,
    loading,
    authorizationLoading,
    authorizationError,
    isSchoolAdmin,
    signOut,
  } = useAuth();
  const [, setLocation] = useLocation();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

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

  if (!isSchoolAdmin) {
    const handleSignOut = async () => {
      setIsSigningOut(true);
      setSignOutError("");

      try {
        const { error } = await signOut();

        if (error) {
          setSignOutError("تعذر تسجيل الخروج حاليًا. حاول مرة أخرى.");
          return;
        }

        setLocation("/login");
      } catch {
        setSignOutError("تعذر تسجيل الخروج حاليًا. حاول مرة أخرى.");
      } finally {
        setIsSigningOut(false);
      }
    };

    return (
      <main
        className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-4"
        dir="rtl"
      >
        <section
          role="alert"
          className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-lg"
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-700">
            <ShieldAlert aria-hidden="true" size={28} />
          </div>
          <h1 className="mt-5 text-xl font-bold text-[#2C3E50]">
            تعذر فتح لوحة الإدارة
          </h1>
          <p className="mt-3 text-sm leading-7 text-gray-700">
            {authorizationError ?? DEFAULT_DENIAL_MESSAGE}
          </p>
          {signOutError && (
            <p className="mt-3 text-sm text-red-700">{signOutError}</p>
          )}
          <Button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="mt-6 gap-2 bg-[#0B4738] text-white hover:bg-[#08382d]"
          >
            <LogOut aria-hidden="true" size={18} />
            {isSigningOut ? "جارٍ تسجيل الخروج..." : "تسجيل الخروج"}
          </Button>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
