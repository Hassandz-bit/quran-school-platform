import { useEffect, useState, type ReactNode } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { fetchStudentManagementAccess } from "@/lib/student-import";

type AccessState = "idle" | "loading" | "allowed" | "forbidden" | "error";

function CenteredState({
  title,
  message,
  role = "alert",
}: {
  title: string;
  message: string;
  role?: "alert" | "status";
}) {
  const { direction } = useLocale();
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-[#F8F9FA] p-4"
      dir={direction}
    >
      <section
        role={role}
        className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-lg"
      >
        <h1 className="text-xl font-bold text-[#2C3E50]">{title}</h1>
        <p className="mt-3 text-sm leading-7 text-gray-600">{message}</p>
        {role === "alert" && (
          <a
            href="/post-login"
            className="mt-5 inline-flex rounded-xl border border-[#0B4738]/20 px-4 py-2 text-sm font-semibold text-[#0B4738]"
          >
            العودة
          </a>
        )}
      </section>
    </main>
  );
}

export default function StudentsRoute({
  children,
  requireManage = false,
}: {
  children: ReactNode;
  requireManage?: boolean;
}) {
  const {
    session,
    school,
    loading,
    authorizationLoading,
    authorizationError,
  } = useAuth();
  const { locale } = useLocale();
  const [accessState, setAccessState] = useState<AccessState>("idle");

  const copy = locale === "ar"
    ? {
        title: "الطلاب",
        checking: "جارٍ التحقق من صلاحيات الطلاب...",
        forbidden: requireManage
          ? "لا تملك صلاحية إضافة أو استيراد الطلاب."
          : "لا تملك صلاحية عرض الطلاب.",
        error: "تعذر التحقق من صلاحيات الطلاب حاليًا دون عرض أي بيانات.",
        scopeError: "تعذر تحديد المدرسة الحالية.",
      }
    : {
        title: "Students",
        checking: "Checking student access...",
        forbidden: requireManage
          ? "You do not have permission to add or import students."
          : "You do not have permission to view students.",
        error: "Student access could not be verified, so no data is shown.",
        scopeError: "The current school could not be resolved.",
      };

  useEffect(() => {
    let cancelled = false;

    if (
      loading ||
      authorizationLoading ||
      !session?.user ||
      !school?.id ||
      authorizationError
    ) {
      setAccessState("idle");
      return () => {
        cancelled = true;
      };
    }

    setAccessState("loading");
    void fetchStudentManagementAccess(school.id)
      .then(access => {
        if (!cancelled) {
          const allowed = requireManage ? access.canManage : access.canView;
          setAccessState(allowed ? "allowed" : "forbidden");
        }
      })
      .catch(() => {
        if (!cancelled) setAccessState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [
    authorizationError,
    authorizationLoading,
    loading,
    requireManage,
    school?.id,
    session?.user,
  ]);

  if (loading || authorizationLoading) {
    return <CenteredState role="status" title={copy.title} message={copy.checking} />;
  }

  if (!session) return <Redirect to="/login" />;

  if (!school || authorizationError) {
    return <CenteredState title={copy.title} message={authorizationError ?? copy.scopeError} />;
  }

  if (accessState === "idle" || accessState === "loading") {
    return <CenteredState role="status" title={copy.title} message={copy.checking} />;
  }

  if (accessState === "forbidden") {
    return <CenteredState title={copy.title} message={copy.forbidden} />;
  }

  if (accessState === "error") {
    return <CenteredState title={copy.title} message={copy.error} />;
  }

  return <>{children}</>;
}
