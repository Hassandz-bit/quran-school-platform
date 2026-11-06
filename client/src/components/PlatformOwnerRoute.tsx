import { useEffect, useState, type ReactNode } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseClient } from "@/lib/supabase";

export default function PlatformOwnerRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const [state, setState] = useState<"checking" | "allowed" | "denied" | "error">("checking");

  useEffect(() => {
    let cancelled = false;
    if (loading) return () => { cancelled = true; };
    if (!session?.user) {
      setState("denied");
      return () => { cancelled = true; };
    }

    void getSupabaseClient()
      .from("platform_owners")
      .select("user_id")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setState("error");
        else setState(data?.user_id === session.user.id ? "allowed" : "denied");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => { cancelled = true; };
  }, [loading, session?.user?.id]);

  if (loading || state === "checking") {
    return <main className="flex min-h-screen items-center justify-center bg-[#F6F8F5]" dir="rtl">
      <p className="text-sm font-semibold text-[#174734]">جارٍ التحقق من صلاحية مالك المنصة...</p>
    </main>;
  }
  if (!session) return <Redirect to="/login" />;
  if (state !== "allowed") {
    return <main className="flex min-h-screen items-center justify-center bg-[#F6F8F5] p-5" dir="rtl">
      <section className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-7 text-center shadow-sm">
        <h1 className="text-xl font-bold text-[#173B2D]">منطقة مالك المنصة</h1>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          {state === "error"
            ? "تعذر التحقق من صلاحية الحساب. أعد المحاولة لاحقًا."
            : "هذا الحساب غير مخوّل لإدارة اشتراكات المدارس."}
        </p>
      </section>
    </main>;
  }
  return <>{children}</>;
}
