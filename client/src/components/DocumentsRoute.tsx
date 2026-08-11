import { useEffect, useState, type ReactNode } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { fetchDocumentsAccess } from "@/lib/documents";

export default function DocumentsRoute({ children }: { children: ReactNode }) {
  const { session, school, loading, authorizationLoading, authorizationError } = useAuth();
  const { locale, direction } = useLocale();
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");

  useEffect(() => {
    if (loading || authorizationLoading) return;
    if (!session || !school?.id || authorizationError) {
      setAccess("denied");
      return;
    }

    let cancelled = false;
    setAccess("checking");
    void fetchDocumentsAccess(school.id)
      .then(result => {
        if (!cancelled) setAccess(result.canView ? "allowed" : "denied");
      })
      .catch(() => {
        if (!cancelled) setAccess("denied");
      });

    return () => {
      cancelled = true;
    };
  }, [authorizationError, authorizationLoading, loading, school?.id, session]);

  if (loading || authorizationLoading || access === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F8F9FA] p-4 text-[#2C3E50]" dir={direction}>
        <div className="flex items-center gap-3" role="status">
          <span className="size-5 animate-spin rounded-full border-2 border-[#0B4738]/30 border-t-[#0B4738]" />
          <span className="text-sm font-medium">
            {locale === "ar" ? "جارٍ التحقق من صلاحيات الوثائق..." : "Checking document access..."}
          </span>
        </div>
      </main>
    );
  }

  if (!session) return <Redirect to="/login" />;
  if (!school || authorizationError || access === "denied") return <Redirect to="/post-login" />;
  return <>{children}</>;
}
