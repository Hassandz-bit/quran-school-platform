import { useEffect, useState } from "react";
import { Loader2, LogOut, ShieldAlert } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { getDefaultAuthenticatedRoute } from "@/lib/default-route";
import { listMyGuardianStudents } from "@/lib/parent-portal";

function LoadingState({ message }: { message: string }) {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-[#F8F9FA] p-4 text-[#2C3E50]"
      dir="rtl"
    >
      <div className="flex items-center gap-3" role="status">
        <Loader2 className="animate-spin text-[#0B4738]" size={22} />
        <span className="text-sm font-medium">{message}</span>
      </div>
    </main>
  );
}

export default function PostLoginRedirect() {
  const [, setLocation] = useLocation();
  const {
    session,
    loading,
    authorizationLoading,
    authorizationError,
    school,
    activeRoleCodes,
    isSchoolAdmin,
    signOut,
  } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [parentCheck, setParentCheck] = useState<
    "idle" | "checking" | "none" | "error"
  >("idle");

  const defaultRoute = getDefaultAuthenticatedRoute({
    isSchoolAdmin,
    activeRoleCodes,
  });
  const defaultRoutePath = defaultRoute?.path ?? null;

  useEffect(() => {
    let cancelled = false;

    if (loading || authorizationLoading) return () => {
      cancelled = true;
    };

    if (!session) {
      setLocation("/login");
      return () => {
        cancelled = true;
      };
    }

    if (school && !authorizationError && defaultRoutePath) {
      setLocation(defaultRoutePath);
      return () => {
        cancelled = true;
      };
    }

    setParentCheck("checking");
    void listMyGuardianStudents()
      .then(students => {
        if (cancelled) return;
        if (students.length > 0) {
          setLocation("/parent");
          return;
        }
        setParentCheck("none");
      })
      .catch(() => {
        if (!cancelled) setParentCheck("error");
      });

    return () => {
      cancelled = true;
    };
  }, [
    authorizationError,
    authorizationLoading,
    defaultRoutePath,
    loading,
    school,
    session,
    setLocation,
  ]);

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

  if (loading || authorizationLoading || parentCheck === "checking") {
    return <LoadingState message="جارٍ تجهيز وجهة الدخول المناسبة..." />;
  }

  if (!session) {
    return <LoadingState message="جارٍ العودة إلى تسجيل الدخول..." />;
  }

  if (school && !authorizationError && defaultRoute) {
    return <LoadingState message={`جارٍ فتح ${defaultRoute.label}...`} />;
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-[#F8F9FA] p-4"
      dir="rtl"
    >
      <section
        role="alert"
        className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-lg"
      >
        <ShieldAlert className="mx-auto mb-3 text-amber-700" size={32} />
        <h1 className="text-xl font-bold text-[#2C3E50]">
          لا توجد وجهة متاحة
        </h1>
        <p className="mt-3 text-sm leading-7 text-gray-700">
          {parentCheck === "error"
            ? "تعذر التحقق من بوابة ولي الأمر حاليًا. حاول مرة أخرى لاحقًا."
            : authorizationError ??
              "لا توجد عضوية مدرسية أو علاقة ولي أمر نشطة متاحة لهذا الحساب."}
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
