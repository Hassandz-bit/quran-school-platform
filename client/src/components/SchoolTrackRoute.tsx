import { useEffect, useState, type ReactNode } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { fetchSchoolTrackScope } from "@/lib/school-track";

type AccessState = "idle" | "loading" | "allowed" | "forbidden" | "error";

function State({ title, message, role = "alert" }: { title: string; message: string; role?: "alert" | "status" }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8F9FA] p-4" dir="rtl">
      <section role={role} className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-lg">
        <h1 className="text-xl font-bold text-[#2C3E50]">{title}</h1>
        <p className="mt-3 text-sm leading-7 text-gray-600">{message}</p>
        {role === "alert" && <a href="/post-login" className="mt-5 inline-flex rounded-xl border border-[#0B4738]/20 px-4 py-2 text-sm font-semibold text-[#0B4738]">العودة إلى وجهة الحساب</a>}
      </section>
    </main>
  );
}

export default function SchoolTrackRoute({ children }: { children: ReactNode }) {
  const { session, school, loading, authorizationLoading, authorizationError } = useAuth();
  const [state, setState] = useState<AccessState>("idle");

  useEffect(() => {
    let cancelled = false;
    if (loading || authorizationLoading || !session?.user || !school?.id || authorizationError) {
      setState("idle");
      return () => { cancelled = true; };
    }
    setState("loading");
    void fetchSchoolTrackScope(school.id)
      .then(scope => {
        if (!cancelled) setState(scope.canView ? "allowed" : "forbidden");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => { cancelled = true; };
  }, [authorizationError, authorizationLoading, loading, school?.id, session?.user]);

  if (loading || authorizationLoading) {
    return <State role="status" title="المسار المدرسي" message="جارٍ التحقق من صلاحية نتائج الطلاب..." />;
  }
  if (!session) return <Redirect to="/login" />;
  if (!school || authorizationError) {
    return <State title="تعذر تحديد المدرسة" message={authorizationError ?? "تعذر تحديد نطاق المدرسة الحالية."} />;
  }
  if (state === "idle" || state === "loading") {
    return <State role="status" title="المسار المدرسي" message="جارٍ التحقق من صلاحية نتائج الطلاب..." />;
  }
  if (state === "forbidden") {
    return <State title="الوصول غير مسموح" message="يلزم امتلاك صلاحية المسار المدرسي ضمن فرع أو حلقة مصرح بها." />;
  }
  if (state === "error") {
    return <State title="تعذر التحقق من الصلاحيات" message="لم تُعرض أي نتائج. حاول مجددًا أو تواصل مع مدير المدرسة." />;
  }
  return <>{children}</>;
}
