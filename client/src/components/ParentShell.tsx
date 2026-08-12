import { type ReactNode, useEffect, useState } from "react";
import { Bell, Home, LogOut, Settings, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { fetchUnreadNotificationCount } from "@/lib/notifications";

export default function ParentShell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { signOut } = useAuth();
  const { direction, t } = useLocale();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let active = true;
    void fetchUnreadNotificationCount().then(count => {
      if (active) setUnreadCount(count);
    });
    return () => {
      active = false;
    };
  }, [location]);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      const { error } = await signOut();
      if (!error) setLocation("/login");
    } finally {
      setIsSigningOut(false);
    }
  };

  const notificationAria = unreadCount > 0
    ? `${t("parent.notifications")}: ${unreadCount} ${t("parent.unreadNotifications")}`
    : t("parent.notifications");

  return (
    <div className="min-h-screen bg-[#F7F5EF] text-[#173B2D]" dir={direction}>
      <header className="sticky top-0 z-30 border-b border-[#DCE7DF] bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setLocation("/parent")}
            className="flex min-w-0 items-center gap-3 text-start"
          >
            <img
              src="/pwa-icon-192.svg"
              alt=""
              aria-hidden="true"
              className="size-10 shrink-0 rounded-xl object-cover shadow-sm ring-1 ring-black/5"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-[#173B2D]">{t("parent.title")}</span>
              <span className="block truncate text-xs text-[#64756D]">{t("brand.school")}</span>
            </span>
          </button>

          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setLocation("/parent")}
              className="gap-2 text-[#0F5132]"
            >
              <Home size={17} />
              <span className="hidden sm:inline">{t("parent.children")}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setLocation("/parent/notifications")}
              className="relative gap-2 text-[#0F5132]"
              aria-label={notificationAria}
            >
              <Bell size={18} />
              <span className="hidden sm:inline">{t("parent.notifications")}</span>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -end-1 flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-5 text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setLocation("/parent/settings")}
              className="gap-2 text-[#0F5132]"
              aria-label={t("parent.settings")}
            >
              <Settings size={18} />
              <span className="hidden md:inline">{t("parent.settings")}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="gap-2 border-[#D6E0D9] text-[#40564B]"
            >
              <LogOut size={17} />
              <span className="hidden sm:inline">{t("shell.signOut")}</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 pt-4 text-xs text-[#607368] sm:px-6">
        <ShieldCheck size={15} className="text-[#17663B]" />
        <span>{t("parent.safety")}</span>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">{children}</main>
    </div>
  );
}
