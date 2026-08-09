import { useEffect, useState, type ReactNode } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchAcademicReportsAccess,
  hasAnyAcademicReportsAccess,
} from "@/lib/academic-reports";

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
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-[#F8F9FA] p-4"
      dir="rtl"
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
            العودة إلى وجهة الحساب
          </a>
        )}
      </section>
    </main>
  );
}

export default function AcademicReportsRoute({
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
  const [accessState, setAccessState] = useState<AccessState>("idle");

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
    void fetchAcademicReportsAccess(school.id)
      .then(access => {
        if (!cancelled) {
          setAccessState(
            hasAnyAcademicReportsAccess(access) ? "allowed" : "forbidden"
          );
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
    school?.id,
    session?.user,
  ]);

  if (loading || authorizationLoading) {
    return (
      <CenteredState
        role="status"
        title="التقارير التعليمية"
        message="جارٍ التحقق من صلاحيات التقارير التعليمية..."
      />
    );
  }

  if (!session) return <Redirect to="/login" />;

  if (!school || authorizationError) {
    return (
      <CenteredState
        title="تعذر تحديد نطاق التقارير التعليمية"
        message={authorizationError ?? "تعذر تحديد المدرسة الحالية."}
      />
    );
  }

  if (accessState === "idle" || accessState === "loading") {
    return (
      <CenteredState
        role="status"
        title="التقارير التعليمية"
        message="جارٍ التحقق من صلاحيات التقارير التعليمية..."
      />
    );
  }

  if (accessState === "forbidden") {
    return (
      <CenteredState
        title="الوصول غير مسموح"
        message="يلزم وصول فعلي إلى الحضور أو الحفظ والمراجعة لفتح التقارير التعليمية."
      />
    );
  }

  if (accessState === "error") {
    return (
      <CenteredState
        title="تعذر التحقق من الصلاحيات"
        message="تعذر التحقق من صلاحيات التقارير التعليمية حاليًا دون عرض أي بيانات."
      />
    );
  }

  return <>{children}</>;
}
