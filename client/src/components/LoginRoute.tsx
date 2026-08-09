import type { ReactNode } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-[#0B4738] p-4 text-white"
        dir="rtl"
      >
        <div className="flex items-center gap-3" role="status">
          <span className="size-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          <span className="text-sm font-medium">جارٍ التحقق من جلسة الدخول...</span>
        </div>
      </main>
    );
  }

  if (session) {
    return <Redirect to="/post-login" />;
  }

  return <>{children}</>;
}
