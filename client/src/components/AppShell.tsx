import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { fetchMembersAccess } from "@/lib/members";
import {
  getAppNavigation,
  getBottomNavigation,
  getCurrentPageLabel,
  type AppNavigationItem,
} from "@/lib/app-navigation";
import { cn } from "@/lib/utils";

const GROUP_LABELS = {
  school: "المدرسة",
  learning: "التعليم",
  management: "الإدارة",
} as const;

function isActive(path: string, itemPath: string) {
  return path === itemPath || (itemPath !== "/dashboard" && path.startsWith(`${itemPath}/`));
}

function Brand({
  schoolName,
  compact = false,
  variant = "dark",
}: {
  schoolName?: string;
  compact?: boolean;
  variant?: "dark" | "light";
}) {
  const isLight = variant === "light";

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#D7B56D] text-base font-extrabold text-[#123B2C] shadow-sm">
        ق
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className={cn("block text-sm font-extrabold", isLight ? "text-[#173B2D]" : "text-white")}>
            QuranOS
          </span>
          <span className={cn("block truncate text-[11px]", isLight ? "text-[#4C6256]" : "text-white/70")}>
            {schoolName ?? "المدرسة القرآنية"}
          </span>
        </span>
      )}
    </div>
  );
}

function NavigationList({
  items,
  currentPath,
  onNavigate,
  compact = false,
}: {
  items: readonly AppNavigationItem[];
  currentPath: string;
  onNavigate: (path: string) => void;
  compact?: boolean;
}) {
  const groups = ["school", "learning", "management"] as const;

  return (
    <nav className="space-y-5" aria-label="التنقل الرئيسي">
      {groups.map(group => {
        const groupItems = items.filter(item => item.group === group);
        if (groupItems.length === 0) return null;

        return (
          <section key={group}>
            {!compact && (
              <p className="mb-2 px-3 text-[11px] font-bold tracking-wide text-white/45">
                {GROUP_LABELS[group]}
              </p>
            )}
            <div className="space-y-1">
              {groupItems.map(item => {
                const active = isActive(currentPath, item.path);
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate(item.path)}
                    title={compact ? item.label : undefined}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-right text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80",
                      active
                        ? "bg-white text-[#173B2D] shadow-sm"
                        : "text-white/78 hover:bg-white/10 hover:text-white",
                      compact && "justify-center px-2"
                    )}
                  >
                    <Icon size={19} className="shrink-0" aria-hidden="true" />
                    {!compact && <span className="truncate">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </nav>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const {
    school,
    activeRoleCodes,
    isSchoolAdmin,
    signOut,
  } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [canViewMembers, setCanViewMembers] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!school?.id) {
      setCanViewMembers(false);
      return () => {
        cancelled = true;
      };
    }

    if (isSchoolAdmin) {
      setCanViewMembers(true);
      return () => {
        cancelled = true;
      };
    }

    void fetchMembersAccess(school.id, false)
      .then(access => {
        if (!cancelled) setCanViewMembers(access.canView);
      })
      .catch(() => {
        if (!cancelled) setCanViewMembers(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isSchoolAdmin, school?.id]);

  const navigation = useMemo(
    () => getAppNavigation({ isSchoolAdmin, activeRoleCodes, canViewMembers }),
    [activeRoleCodes, canViewMembers, isSchoolAdmin]
  );
  const bottomNavigation = useMemo(
    () => getBottomNavigation(navigation),
    [navigation]
  );
  const currentPageLabel = getCurrentPageLabel(location, navigation);

  useEffect(() => {
    if (!drawerOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  const navigate = (path: string) => {
    setLocation(path);
    setDrawerOpen(false);
  };

  const handleSignOut = async () => {
    try {
      const { error } = await signOut();
      if (error) throw error;
      setLocation("/login");
    } catch {
      toast.error("تعذر تسجيل الخروج حاليًا. حاول مرة أخرى.");
    }
  };

  return (
    <div className="min-h-screen overflow-x-clip bg-[#F7F8F3] text-[#173B2D]" dir="rtl">
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-30 hidden flex-col bg-[#123B2C] px-3 py-5 shadow-[0_0_30px_rgba(18,59,44,0.14)] transition-[width] duration-200 md:flex",
          sidebarExpanded ? "w-64" : "w-20"
        )}
      >
        <div className="mb-7 flex items-center justify-between gap-2 px-1">
          <Brand schoolName={school?.name} compact={!sidebarExpanded} />
          {sidebarExpanded && (
            <button
              type="button"
              onClick={() => setSidebarExpanded(false)}
              className="grid size-9 place-items-center rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label="طي القائمة الجانبية"
            >
              <PanelRightClose size={18} aria-hidden="true" />
            </button>
          )}
        </div>
        {!sidebarExpanded && (
          <button
            type="button"
            onClick={() => setSidebarExpanded(true)}
            className="mb-5 grid size-11 place-items-center self-center rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label="توسيع القائمة الجانبية"
          >
            <PanelRightOpen size={18} aria-hidden="true" />
          </button>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavigationList
            items={navigation}
            currentPath={location}
            onNavigate={navigate}
            compact={!sidebarExpanded}
          />
        </div>

        <button
          type="button"
          onClick={() => void handleSignOut()}
          className={cn(
            "mt-4 flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-white/75 transition hover:bg-red-400/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
            !sidebarExpanded && "justify-center px-2"
          )}
          title={!sidebarExpanded ? "تسجيل الخروج" : undefined}
        >
          <LogOut size={19} aria-hidden="true" />
          {sidebarExpanded && <span>تسجيل الخروج</span>}
        </button>
      </aside>

      <div className={cn("min-w-0 transition-[margin] duration-200", sidebarExpanded ? "md:mr-64" : "md:mr-20")}>
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-[#E2E9E3] bg-[#FDFEFA]/95 px-4 backdrop-blur md:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="grid size-11 shrink-0 place-items-center rounded-xl text-[#244E3B] transition hover:bg-[#EAF3EC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F855A] md:hidden"
              aria-label="فتح قائمة المزيد"
            >
              <Menu size={21} aria-hidden="true" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-[#173B2D]">
                {currentPageLabel}
              </p>
              <p className="truncate text-[11px] text-[#718377]">
                {school?.name ?? "المدرسة القرآنية"}
              </p>
            </div>
          </div>
          <span className="hidden rounded-full bg-[#EAF3EC] px-3 py-1 text-xs font-semibold text-[#2F6E46] sm:inline">
            QuranOS
          </span>
        </header>

        <main className="min-w-0 px-4 py-5 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-6 md:px-8 md:pb-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[#DFE8E0] bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(23,59,45,0.06)] backdrop-blur md:hidden"
        aria-label="التنقل السفلي"
      >
        <div className="mx-auto flex max-w-lg items-end justify-around gap-1">
          {bottomNavigation.map(item => {
            const active = isActive(location, item.path);
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.path)}
                className={cn(
                  "flex min-h-12 min-w-12 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F855A]",
                  active ? "bg-[#E9F4EC] text-[#17663B]" : "text-[#718377]"
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={19} aria-hidden="true" />
                <span className="max-w-full truncate">{item.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex min-h-12 min-w-12 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-bold text-[#718377] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F855A]"
            aria-label="المزيد"
          >
            <MoreHorizontal size={21} aria-hidden="true" />
            <span>المزيد</span>
          </button>
        </div>
      </nav>

      {drawerOpen && (
        <div className="fixed inset-0 z-50" role="presentation">
          <button
            type="button"
            className="absolute inset-0 w-full cursor-default bg-[#10261D]/45"
            onClick={() => setDrawerOpen(false)}
            aria-label="إغلاق قائمة المزيد"
          />
          <aside
            className="absolute bottom-0 left-0 right-0 max-h-[84vh] overflow-y-auto rounded-t-[2rem] bg-[#FDFEFA] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl md:bottom-auto md:left-auto md:right-6 md:top-5 md:w-96 md:rounded-3xl"
            aria-label="قائمة المزيد"
          >
            <div className="mb-5 flex items-center justify-between">
              <Brand schoolName={school?.name} variant="light" />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="grid size-11 place-items-center rounded-xl text-[#4C6256] transition hover:bg-[#EAF3EC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F855A]"
                aria-label="إغلاق القائمة"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="mb-5 h-1.5 w-11 rounded-full bg-[#DCE8DE] md:hidden" />
            <div className="space-y-5">
              {(["school", "learning", "management"] as const).map(group => {
                const items = navigation.filter(item => item.group === group);
                if (items.length === 0) return null;

                return (
                  <section key={group}>
                    <h2 className="mb-2 px-1 text-xs font-bold text-[#718377]">
                      {GROUP_LABELS[group]}
                    </h2>
                    <div className="grid gap-1">
                      {items.map(item => {
                        const active = isActive(location, item.path);
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => navigate(item.path)}
                            className={cn(
                              "flex min-h-12 items-center gap-3 rounded-xl px-3 text-right text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F855A]",
                              active
                                ? "bg-[#E9F4EC] text-[#17663B]"
                                : "text-[#244E3B] hover:bg-[#F0F6F1]"
                            )}
                          >
                            <Icon size={19} aria-hidden="true" />
                            <span>{item.label}</span>
                            {active ? (
                              <ChevronLeft className="mr-auto size-4" aria-hidden="true" />
                            ) : (
                              <ChevronRight className="mr-auto size-4 opacity-40" aria-hidden="true" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="mt-6 flex min-h-12 w-full items-center gap-3 rounded-xl border border-red-100 px-3 text-sm font-bold text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            >
              <LogOut size={19} aria-hidden="true" />
              تسجيل الخروج
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}
