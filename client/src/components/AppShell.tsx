import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  X,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import PreferencesDialog from "@/components/PreferencesDialog";
import { useLocale } from "@/contexts/LocaleContext";
import { fetchMembersAccess } from "@/lib/members";
import {
  fetchAcademicReportsAccess,
  hasAnyAcademicReportsAccess,
} from "@/lib/academic-reports";
import { fetchRegistrationCrmAccess } from "@/lib/registration-crm";
import { fetchDocumentsAccess } from "@/lib/documents";
import { fetchSchoolTrackScope } from "@/lib/school-track";
import { getInstitutionLogoUrl } from "@/lib/institution-settings";
import {
  getAppNavigation,
  getBottomNavigation,
  getCurrentPageLabel,
  type AppNavigationItem,
} from "@/lib/app-navigation";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/locale";

function isActive(path: string, itemPath: string) {
  return path === itemPath || (itemPath !== "/dashboard" && path.startsWith(`${itemPath}/`));
}

const SIDEBAR_SCROLL_KEY = "quranos:app-sidebar-scroll";

function readStoredScroll(key: string): number {
  try {
    const value = Number(window.sessionStorage.getItem(key));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function storeScroll(key: string, value: number) {
  try {
    window.sessionStorage.setItem(key, String(value));
  } catch {
    // Keep navigation usable when session storage is unavailable.
  }
}

function Brand({
  schoolName,
  fallbackSchoolName,
  logoUrl,
  compact = false,
  variant = "dark",
}: {
  schoolName?: string;
  fallbackSchoolName: string;
  logoUrl?: string | null;
  compact?: boolean;
  variant?: "dark" | "light";
}) {
  const isLight = variant === "light";

  return (
    <div className="flex min-w-0 items-center gap-3">
      <img
        src={logoUrl ?? "/pwa-icon-192.svg"}
        alt=""
        aria-hidden="true"
        className={cn(
          "size-10 shrink-0 rounded-xl shadow-sm ring-1 ring-black/5",
          logoUrl ? "bg-white p-1 object-contain" : "object-cover"
        )}
      />
      {!compact && (
        <span className="min-w-0">
          <span
            className={cn(
              "block text-sm font-extrabold",
              isLight ? "text-[#0F5132]" : "text-white"
            )}
            dir="ltr"
          >
            Quran<span className="text-[#DAAF37]">OS</span>
          </span>
          <span className={cn("block truncate text-[11px]", isLight ? "text-[#4C6256]" : "text-white/70")}>
            {schoolName ?? fallbackSchoolName}
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
  groupLabels,
  ariaLabel,
}: {
  items: readonly AppNavigationItem[];
  currentPath: string;
  onNavigate: (path: string) => void;
  compact?: boolean;
  groupLabels: Record<"school" | "learning" | "management", string>;
  ariaLabel: string;
}) {
  const groups = ["school", "learning", "management"] as const;

  return (
    <nav className="space-y-5" aria-label={ariaLabel}>
      {groups.map(group => {
        const groupItems = items.filter(item => item.group === group);
        if (groupItems.length === 0) return null;

        return (
          <section key={group}>
            {!compact && (
              <p className="mb-2 px-3 text-[11px] font-bold tracking-wide text-white/45">
                {groupLabels[group]}
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
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-start text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80",
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
  const { locale, direction, currency, t } = useLocale();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [canViewMembers, setCanViewMembers] = useState(false);
  const [canViewAcademicReports, setCanViewAcademicReports] = useState(false);
  const [canViewSchoolTrack, setCanViewSchoolTrack] = useState(false);
  const [canViewRegistrations, setCanViewRegistrations] = useState(false);
  const [canViewDocuments, setCanViewDocuments] = useState(false);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    let cancelled = false;

    if (!school?.id) {
      setCanViewAcademicReports(false);
      return () => {
        cancelled = true;
      };
    }

    void fetchAcademicReportsAccess(school.id)
      .then(access => {
        if (!cancelled) {
          setCanViewAcademicReports(hasAnyAcademicReportsAccess(access));
        }
      })
      .catch(() => {
        if (!cancelled) setCanViewAcademicReports(false);
      });

    return () => {
      cancelled = true;
    };
  }, [school?.id]);

  useEffect(() => {
    let cancelled = false;

    if (!school?.id) {
      setCanViewSchoolTrack(false);
      return () => {
        cancelled = true;
      };
    }

    void fetchSchoolTrackScope(school.id)
      .then(scope => {
        if (!cancelled) setCanViewSchoolTrack(scope.canView);
      })
      .catch(() => {
        if (!cancelled) setCanViewSchoolTrack(false);
      });

    return () => {
      cancelled = true;
    };
  }, [school?.id]);

  useEffect(() => {
    let cancelled = false;

    if (!school?.id) {
      setCanViewRegistrations(false);
      return () => {
        cancelled = true;
      };
    }

    void fetchRegistrationCrmAccess(school.id)
      .then(access => {
        if (!cancelled) setCanViewRegistrations(access.canView);
      })
      .catch(() => {
        if (!cancelled) setCanViewRegistrations(false);
      });

    return () => {
      cancelled = true;
    };
  }, [school?.id]);

  useEffect(() => {
    let cancelled = false;

    if (!school?.id) {
      setCanViewDocuments(false);
      return () => {
        cancelled = true;
      };
    }

    void fetchDocumentsAccess(school.id)
      .then(access => {
        if (!cancelled) setCanViewDocuments(access.canView);
      })
      .catch(() => {
        if (!cancelled) setCanViewDocuments(false);
      });

    return () => {
      cancelled = true;
    };
  }, [school?.id]);

  const navigation = useMemo(
    () =>
      getAppNavigation({
        isSchoolAdmin,
        activeRoleCodes,
        canViewMembers,
        canViewAcademicReports,
        canViewSchoolTrack,
        canViewRegistrations,
        canViewDocuments,
        locale,
      }),
    [
      activeRoleCodes,
      canViewAcademicReports,
      canViewSchoolTrack,
      canViewDocuments,
      canViewMembers,
      canViewRegistrations,
      isSchoolAdmin,
      locale,
    ]
  );
  const bottomNavigation = useMemo(
    () => getBottomNavigation(navigation),
    [navigation]
  );
  const currentPageLabel = getCurrentPageLabel(location, navigation);
  const groupLabels = useMemo(
    () => ({
      school: t("group.school"),
      learning: t("group.learning"),
      management: t("group.management"),
    }),
    [t]
  );
  const fallbackSchoolName = t("brand.school");
  const schoolLogoUrl = getInstitutionLogoUrl(school?.logo_path);
  const CollapseIcon = direction === "rtl" ? PanelRightClose : PanelLeftClose;
  const ExpandIcon = direction === "rtl" ? PanelRightOpen : PanelLeftOpen;
  const DrawerChevron = direction === "rtl" ? ChevronLeft : ChevronRight;

  useLayoutEffect(() => {
    const container = sidebarScrollRef.current;
    if (!container) return;

    container.scrollTop = readStoredScroll(SIDEBAR_SCROLL_KEY);
    const frame = window.requestAnimationFrame(() => {
      const activeItem = container.querySelector<HTMLElement>('[aria-current="page"]');
      if (!activeItem) return;

      const containerRect = container.getBoundingClientRect();
      const itemRect = activeItem.getBoundingClientRect();
      if (itemRect.top < containerRect.top || itemRect.bottom > containerRect.bottom) {
        activeItem.scrollIntoView({ block: "nearest", inline: "nearest" });
        storeScroll(SIDEBAR_SCROLL_KEY, container.scrollTop);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [location, navigation.length, sidebarExpanded]);

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
      toast.error(t("shell.signOutError"));
    }
  };

  return (
    <div className="min-h-screen overflow-x-clip bg-[#F7F5EF] text-[#173B2D]" dir={direction}>
      <aside
        className={cn(
          "fixed inset-y-0 z-30 hidden flex-col bg-[#0F5132] px-3 py-5 shadow-[0_0_30px_rgba(15,81,50,0.14)] transition-[width] duration-200 md:flex",
          direction === "rtl" ? "right-0" : "left-0",
          sidebarExpanded ? "w-64" : "w-20"
        )}
      >
        <div className="mb-7 flex items-center justify-between gap-2 px-1">
          <Brand schoolName={school?.name} fallbackSchoolName={fallbackSchoolName} logoUrl={schoolLogoUrl} compact={!sidebarExpanded} />
          {sidebarExpanded && (
            <button
              type="button"
              onClick={() => setSidebarExpanded(false)}
              className="grid size-9 place-items-center rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label={t("shell.collapseSidebar")}
            >
              <CollapseIcon size={18} aria-hidden="true" />
            </button>
          )}
        </div>
        {!sidebarExpanded && (
          <button
            type="button"
            onClick={() => setSidebarExpanded(true)}
            className="mb-5 grid size-11 place-items-center self-center rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label={t("shell.expandSidebar")}
          >
            <ExpandIcon size={18} aria-hidden="true" />
          </button>
        )}

        <div
          ref={sidebarScrollRef}
          onScroll={event => storeScroll(SIDEBAR_SCROLL_KEY, event.currentTarget.scrollTop)}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <NavigationList
            items={navigation}
            currentPath={location}
            onNavigate={navigate}
            compact={!sidebarExpanded}
            groupLabels={groupLabels}
            ariaLabel={t("shell.mainNavigation")}
          />
        </div>

        <button
          type="button"
          onClick={() => void handleSignOut()}
          className={cn(
            "mt-4 flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-white/75 transition hover:bg-red-400/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
            !sidebarExpanded && "justify-center px-2"
          )}
          title={!sidebarExpanded ? t("shell.signOut") : undefined}
        >
          <LogOut size={19} aria-hidden="true" />
          {sidebarExpanded && <span>{t("shell.signOut")}</span>}
        </button>
      </aside>

      <div
        className={cn(
          "min-w-0 transition-[margin] duration-200",
          direction === "rtl"
            ? sidebarExpanded ? "md:mr-64" : "md:mr-20"
            : sidebarExpanded ? "md:ml-64" : "md:ml-20"
        )}
      >
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-[#E2E9E3] bg-[#FDFEFA]/95 px-4 backdrop-blur md:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="grid size-11 shrink-0 place-items-center rounded-xl text-[#244E3B] transition hover:bg-[#EAF3EC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F855A] md:hidden"
              aria-label={t("shell.openMore")}
            >
              <Menu size={21} aria-hidden="true" />
            </button>
            <div className="flex min-w-0 items-center gap-2">
              {schoolLogoUrl && (
                <img src={schoolLogoUrl} alt="" aria-hidden="true" className="size-8 shrink-0 rounded-lg bg-white object-contain ring-1 ring-[#E2E9E3]" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-[#173B2D]">
                  {currentPageLabel}
                </p>
                <p className="truncate text-[11px] text-[#718377]">
                  {school?.name ?? fallbackSchoolName}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <PreferencesDialog />
            <span className="hidden rounded-full bg-[#F3E8C6] px-3 py-1 text-xs font-extrabold text-[#0F5132] sm:inline" dir="ltr">
              Quran<span className="text-[#B28820]">OS</span>
            </span>
          </div>
        </header>

        <main className="min-w-0 px-4 py-5 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-6 md:px-8 md:pb-8">
          <div key={currency} className="quranos-page-root mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[#DFE8E0] bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(23,59,45,0.06)] backdrop-blur md:hidden"
        aria-label={t("shell.bottomNavigation")}
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
            aria-label={t("shell.more")}
          >
            <MoreHorizontal size={21} aria-hidden="true" />
            <span>{t("shell.more")}</span>
          </button>
        </div>
      </nav>

      {drawerOpen && (
        <div className="fixed inset-0 z-50" role="presentation">
          <button
            type="button"
            className="absolute inset-0 w-full cursor-default bg-[#10261D]/45"
            onClick={() => setDrawerOpen(false)}
            aria-label={t("shell.closeMore")}
          />
          <aside
            className={cn(
              "absolute bottom-0 left-0 right-0 max-h-[84vh] overflow-y-auto rounded-t-[2rem] bg-[#FDFEFA] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl md:bottom-auto md:top-5 md:w-96 md:rounded-3xl",
              direction === "rtl" ? "md:left-auto md:right-6" : "md:left-6 md:right-auto"
            )}
            aria-label={t("shell.more")}
          >
            <div className="mb-5 flex items-center justify-between">
              <Brand schoolName={school?.name} fallbackSchoolName={fallbackSchoolName} logoUrl={schoolLogoUrl} variant="light" />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="grid size-11 place-items-center rounded-xl text-[#4C6256] transition hover:bg-[#EAF3EC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F855A]"
                aria-label={t("shell.closeMenu")}
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
                      {groupLabels[group]}
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
                              "flex min-h-12 items-center gap-3 rounded-xl px-3 text-start text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F855A]",
                              active
                                ? "bg-[#E9F4EC] text-[#17663B]"
                                : "text-[#244E3B] hover:bg-[#F0F6F1]"
                            )}
                          >
                            <Icon size={19} aria-hidden="true" />
                            <span>{item.label}</span>
                            <DrawerChevron className="ms-auto size-4 opacity-60" aria-hidden="true" />
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
              {t("shell.signOut")}
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}
