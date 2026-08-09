import { useEffect, useState, type ReactNode } from "react";
import { LogOut, ShieldAlert } from "lucide-react";
import { Redirect, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { listMyGuardianStudents } from "@/lib/parent-portal";

type AccessState = "checking" | "allowed" | "denied" | "error";

export default function ParentRoute({ children }: { children: ReactNode }) {
  const { session, loading, signOut } = useAuth();
  const [, setLocation] = useLocation();
  const [state, setState] = useState<AccessState>("checking");
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (loading) return () => {
      cancelled = true;
    };

    if (!session) {
      setState("denied");
      return () => {
        cancelled = true;
      };
    }

    setState("checking");
    void listMyGuardianStudents()
      .then(students => {
        if (!cancelled) setState(students.length > 0 ? "allowed" : "denied");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [loading, session]);

  if (loading || state === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F7F8F3] p-4" dir="rtl">
        <div className="flex items-center gap-3 text-[#173B2D]" role="status">
          <span className="size-5 animate-spin rounded-full border-2 border-[#17663B]/30 border-t-[#17663B]" />
          <span className="text-sm font-medium">جارٍ التحقق من وصول ولي الأمر...</span>
        </div>
      </main>
    );
  }

  if (!session) return <Redirect to="/login" />;
  if (state === "allowed") return <>{children}</>;

  const handleSignOut = async () => {
    setIsSigningOut(true);
    const { error } = await signOut();
    setIsSigningOut(false);
    if (!error) setLocation("/login");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F8F3] p-4" dir="rtl">
      <section role="alert" className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-lg">
        <ShieldAlert className="mx-auto text-amber-700" size={38} />
        <h1 className="mt-4 text-xl font-bold text-[#173B2D]">تعذر فتح بوابة ولي الأمر</h1>
        <p className="mt-3 text-sm leading-7 text-gray-700">
          {state === "error"
            ? "تعذر التحقق من الوصول حاليًا. حاول مرة أخرى لاحقًا."
            : "لا توجد علاقة ولي أمر نشطة متاحة لهذا الحساب."}
        </p>
        <Button
          type="button"
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="mt-6 gap-2 bg-[#0B4738] text-white hover:bg-[#08382d]"
        >
          <LogOut size={18} />
          {isSigningOut ? "جارٍ تسجيل الخروج..." : "تسجيل الخروج"}
        </Button>
      </section>
    </main>
  );
}
