import { useEffect, useState, type ReactNode } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { fetchMembersAccess } from "@/lib/members";

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
            href="/dashboard"
            className="mt-5 inline-flex rounded-xl border border-[#0B4738]/20 px-4 py-2 text-sm font-semibold text-[#0B4738]"
          >
            العودة إلى لوحة التحكم
          </a>
        )}
      </section>
    </main>
  );
}

export default function MembersRoute({ children }: { children: ReactNode }) {
  const {
    session,
    school,
    loading,
    authorizationLoading,
    authorizationError,
    isSchoolAdmin,
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
    void fetchMembersAccess(school.id, isSchoolAdmin)
      .then(access => {
        if (!cancelled) {
          setAccessState(access.canView ? "allowed" : "forbidden");
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
    isSchoolAdmin,
    loading,
    school?.id,
    session?.user,
  ]);

  if (loading || authorizationLoading) {
    return (
      <CenteredState
        role="status"
        title="أعضاء المدرسة"
        message="جارٍ التحقق من صلاحيات دليل الأعضاء..."
      />
    );
  }

  if (!session) return <Redirect to="/login" />;

  if (!school || authorizationError) {
    return (
      <CenteredState
        title="تعذر تحديد نطاق الأعضاء"
        message={authorizationError ?? "تعذر تحديد المدرسة الحالية."}
      />
    );
  }

  if (accessState === "idle" || accessState === "loading") {
    return (
      <CenteredState
        role="status"
        title="أعضاء المدرسة"
        message="جارٍ التحقق من صلاحيات دليل الأعضاء..."
      />
    );
  }

  if (accessState === "forbidden") {
    return (
      <CenteredState
        title="الوصول غير مسموح"
        message="لا تملك صلاحية عرض أعضاء المدرسة. يلزم members.view وprofiles.view معًا."
      />
    );
  }

  if (accessState === "error") {
    return (
      <CenteredState
        title="تعذر التحقق من الصلاحيات"
        message="تعذر التحقق من صلاحية دليل الأعضاء حاليًا دون عرض أي بيانات."
      />
    );
  }

  return <>{children}</>;
}
