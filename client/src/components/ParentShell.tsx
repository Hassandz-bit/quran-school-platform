import { type ReactNode, useState } from "react";
import { Home, LogOut, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

export default function ParentShell({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const { signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      const { error } = await signOut();
      if (!error) setLocation("/login");
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F8F3] text-[#173B2D]" dir="rtl">
      <header className="sticky top-0 z-30 border-b border-[#DCE7DF] bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setLocation("/parent")}
            className="flex min-w-0 items-center gap-3 text-right"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#0B4738] font-bold text-[#D7B56D]">ق</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-[#173B2D]">بوابة ولي الأمر</span>
              <span className="block truncate text-xs text-[#64756D]">منصة المدرسة القرآنية</span>
            </span>
          </button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setLocation("/parent")}
              className="gap-2 text-[#0B4738]"
            >
              <Home size={17} />
              <span className="hidden sm:inline">أبنائي</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="gap-2 border-[#D6E0D9] text-[#40564B]"
            >
              <LogOut size={17} />
              <span className="hidden sm:inline">تسجيل الخروج</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 pt-4 text-xs text-[#607368] sm:px-6">
        <ShieldCheck size={15} className="text-[#17663B]" />
        <span>عرض آمن ومخصص للأبناء المرتبطين بحسابك فقط</span>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">{children}</main>
    </div>
  );
}
