import { useEffect, useMemo, useState } from "react";
import { Loader2, LogOut, ShieldAlert, GraduationCap, Users, Wallet, BookOpen, UserRound } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { getAvailableAuthenticatedRoutes, getDefaultAuthenticatedRoute } from "@/lib/default-route";
import { listMyGuardianStudents } from "@/lib/parent-portal";
import { getSupabaseClient } from "@/lib/supabase";

function LoadingState({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8F9FA] p-4 text-[#2C3E50]" dir="rtl">
      <div className="flex items-center gap-3" role="status">
        <Loader2 className="animate-spin text-[#0B4738]" size={22} />
        <span className="text-sm font-medium">{message}</span>
      </div>
    </main>
  );
}

const PORTAL_ICONS = {
  "/dashboard": ShieldAlert,
  "/attendance": GraduationCap,
  "/memorization": BookOpen,
  "/finance": Wallet,
  "/members": Users,
} as const;

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
  const [parentCheck, setParentCheck] = useState<"idle" | "checking" | "none" | "error">("idle");
  const [portalChoices, setPortalChoices] = useState<Array<{ path: string; label: string }>>([]);

  const availableRoutes = useMemo(
    () => getAvailableAuthenticatedRoutes({ isSchoolAdmin, activeRoleCodes }),
    [isSchoolAdmin, activeRoleCodes]
  );
  const defaultRoute = getDefaultAuthenticatedRoute({ isSchoolAdmin, activeRoleCodes });

  useEffect(() => {
    let cancelled = false;

    if (loading || authorizationLoading) return () => { cancelled = true; };

    if (!session) {
      setLocation("/login");
      return () => { cancelled = true; };
    }

    setPortalChoices([]);

    if (school && !authorizationError && availableRoutes.length > 0) {
      setParentCheck("checking");
      void listMyGuardianStudents()
        .then(students => {
          if (cancelled) return;
          const choices = [
            ...availableRoutes,
            ...(students.length > 0
              ? [{ path: "/parent", label: "بوابة ولي الأمر" }]
              : []),
          ];
          if (choices.length === 1) {
            setLocation(choices[0].path);
          } else {
            setPortalChoices(choices);
            setParentCheck("none");
          }
        })
        .catch(() => {
          if (cancelled) return;
          if (availableRoutes.length === 1) {
            setLocation(availableRoutes[0].path);
          } else {
            setPortalChoices(availableRoutes);
            setParentCheck("none");
          }
        });
      return () => { cancelled = true; };
    }

    setParentCheck("checking");
    void (async () => {
      try {
        if (!school) {
          const { data: ownerRecord, error: ownerError } = await getSupabaseClient()
            .from("platform_owners")
            .select("user_id")
            .eq("user_id", session.user.id)
            .maybeSingle();
          if (cancelled) return;
          if (!ownerError && ownerRecord?.user_id === session.user.id) {
            setLocation("/platform-owner");
            return;
          }
        }

        if (!school) {
          const { data: profileRecord, error: profileLookupError } = await getSupabaseClient()
            .from("profiles")
            .select("id,status")
            .eq("id", session.user.id)
            .maybeSingle();
          if (cancelled) return;
          if (!profileLookupError && !profileRecord) {
            setLocation("/school-registration");
            return;
          }

          const { data: schoolRequest } = await getSupabaseClient()
            .from("school_registration_requests")
            .select("id,status")
            .eq("applicant_profile_id", session.user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (cancelled) return;
          if (schoolRequest && ["pending", "rejected"].includes(schoolRequest.status)) {
            setLocation("/school-registration");
            return;
          }
        }

        const students = await listMyGuardianStudents();
        if (cancelled) return;
        if (students.length > 0) {
          setLocation("/parent");
          return;
        }
        if (!school && !authorizationError) {
          setLocation("/school-registration");
          return;
        }
        setParentCheck("none");
      } catch {
        if (!cancelled) setParentCheck("error");
      }
    })();

    return () => { cancelled = true; };
  }, [authorizationError, authorizationLoading, availableRoutes, loading, school, session, setLocation]);

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

  if (!session) return <LoadingState message="جارٍ العودة إلى تسجيل الدخول..." />;

  if (school && !authorizationError && portalChoices.length > 1) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F8F9FA] p-4" dir="rtl">
        <section className="w-full max-w-xl rounded-2xl border border-[#0B4738]/10 bg-white p-7 shadow-lg">
          <div className="text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-[#0B4738]/10 text-[#0B4738]">
              <UserRound size={28} />
            </div>
            <h1 className="mt-4 text-2xl font-bold text-[#173B2D]">اختر بوابة الدخول</h1>
            <p className="mt-2 text-sm leading-7 text-gray-600">
              لهذا الحساب أكثر من دور فعّال. اختر مساحة العمل التي تريد فتحها الآن.
            </p>
            <p className="mt-1 text-xs text-gray-500">{school.name}</p>
          </div>
          <div className="mt-6 grid gap-3">
            {portalChoices.map(portal => {
              const Icon = PORTAL_ICONS[portal.path as keyof typeof PORTAL_ICONS] ?? UserRound;
              return (
                <Button
                  key={portal.path}
                  type="button"
                  variant="outline"
                  onClick={() => setLocation(portal.path)}
                  className="h-auto justify-between rounded-xl border-[#0B4738]/20 px-4 py-4 text-base font-bold text-[#0B4738] hover:bg-[#0B4738]/5"
                >
                  <span>{portal.path === "/attendance" ? "بوابة المعلم والحضور" : portal.label}</span>
                  <Icon aria-hidden="true" size={20} />
                </Button>
              );
            })}
          </div>
          {signOutError && <p className="mt-3 text-sm text-red-700">{signOutError}</p>}
          <Button type="button" variant="ghost" onClick={handleSignOut} disabled={isSigningOut} className="mt-4 w-full">
            <LogOut aria-hidden="true" size={17} className="ml-2" />
            {isSigningOut ? "جارٍ تسجيل الخروج..." : "تسجيل الخروج"}
          </Button>
        </section>
      </main>
    );
  }

  if (school && !authorizationError && defaultRoute) {
    return <LoadingState message={`جارٍ فتح ${defaultRoute.label}...`} />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8F9FA] p-4" dir="rtl">
      <section role="alert" className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-lg">
        <ShieldAlert className="mx-auto mb-3 text-amber-700" size={32} />
        <h1 className="text-xl font-bold text-[#2C3E50]">لا توجد وجهة متاحة</h1>
        <p className="mt-3 text-sm leading-7 text-gray-700">
          {parentCheck === "error"
            ? "تعذر التحقق من بوابة ولي الأمر حاليًا. حاول مرة أخرى لاحقًا."
            : authorizationError ?? "لا توجد عضوية مدرسية أو علاقة ولي أمر نشطة متاحة لهذا الحساب."}
        </p>
        {signOutError && <p className="mt-3 text-sm text-red-700">{signOutError}</p>}
        <Button type="button" onClick={handleSignOut} disabled={isSigningOut} className="mt-6 gap-2 bg-[#0B4738] text-white hover:bg-[#08382d]">
          <LogOut aria-hidden="true" size={18} />
          {isSigningOut ? "جارٍ تسجيل الخروج..." : "تسجيل الخروج"}
        </Button>
      </section>
    </main>
  );
}
