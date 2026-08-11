import { useEffect, useState, type ReactNode } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { getSupabaseClient } from "@/lib/supabase";

type StudentsRouteProps = { children: ReactNode; requireManage?: boolean };

export default function StudentsRoute({ children, requireManage = false }: StudentsRouteProps) {
  const { session, school, loading, authorizationLoading, authorizationError } = useAuth();
  const { direction } = useLocale();
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");

  useEffect(() => {
    if (loading || authorizationLoading) return;
    if (!session || !school || authorizationError) {
      setAccess("denied");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const client = getSupabaseClient();
        const { data: branches, error } = await client.from("branches").select("id").eq("school_id", school.id).eq("status", "active");
        if (error) throw error;
        const permission = requireManage ? "students.manage" : "students.view";
        for (const branch of branches ?? []) {
          const [{ data: direct }, { data: manage }] = await Promise.all([
            client.rpc("has_branch_permission", { target_school_id: school.id, target_branch_id: branch.id, target_permission_code: permission }),
            requireManage ? Promise.resolve({ data: false }) : client.rpc("has_branch_permission", { target_school_id: school.id, target_branch_id: branch.id, target_permission_code: "students.manage" }),
          ]);
          if (direct === true || manage === true) {
            if (!cancelled) setAccess("allowed");
            return;
          }
        }
        if (!cancelled) setAccess("denied");
      } catch {
        if (!cancelled) setAccess("denied");
      }
    })();
    return () => { cancelled = true; };
  }, [authorizationError, authorizationLoading, loading, requireManage, school, session]);

  if (loading || authorizationLoading || access === "checking") {
    return <main className="flex min-h-screen items-center justify-center bg-[#F8F9FA] text-[#2C3E50]" dir={direction}><div className="flex items-center gap-3" role="status"><span className="size-5 animate-spin rounded-full border-2 border-[#0B4738]/30 border-t-[#0B4738]" /><span className="text-sm font-medium">{direction === "rtl" ? "جارٍ التحقق من صلاحيات الطلاب..." : "Checking student access..."}</span></div></main>;
  }
  if (!session) return <Redirect to="/login" />;
  if (!school || authorizationError || access === "denied") return <Redirect to="/post-login" />;
  return <>{children}</>;
}
