import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  BookOpenCheck,
  ChartNoAxesCombined,
  CalendarDays,
  ClipboardList,
  DollarSign,
  GraduationCap,
  Home,
  ReceiptText,
  Settings,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { translate, type AppLocale } from "./locale.ts";

export type AppNavigationInput = {
  isSchoolAdmin: boolean;
  activeRoleCodes: readonly string[];
  canViewMembers?: boolean;
  canViewAcademicReports?: boolean;
  canViewRegistrations?: boolean;
  locale?: AppLocale;
};

export type AppNavigationItem = {
  id:
    | "dashboard"
    | "students"
    | "teachers"
    | "classes"
    | "attendance"
    | "memorization"
    | "academic-reports"
    | "finance"
    | "receipts"
    | "registrations"
    | "guardians"
    | "notifications"
    | "members"
    | "settings";
  label: string;
  path: string;
  group: "school" | "learning" | "management";
  icon: LucideIcon;
};

const hasRole = (roles: ReadonlySet<string>, role: string) => roles.has(role);

export function getAppNavigation({
  isSchoolAdmin,
  activeRoleCodes,
  canViewMembers = false,
  canViewAcademicReports = false,
  canViewRegistrations = false,
  locale = "ar",
}: AppNavigationInput): AppNavigationItem[] {
  const roles = new Set(activeRoleCodes);
  const canManageSchool = isSchoolAdmin;
  const canUseLearning =
    isSchoolAdmin ||
    hasRole(roles, "teacher") ||
    hasRole(roles, "academic_supervisor") ||
    hasRole(roles, "branch_manager");
  const canUseFinance =
    isSchoolAdmin ||
    hasRole(roles, "finance_officer") ||
    hasRole(roles, "branch_manager");
  const canUseReceipts =
    canUseFinance || hasRole(roles, "registrar");
  const canUseRegistrations = canViewRegistrations;
  const canUseMembers = isSchoolAdmin || canViewMembers;
  const canUseGuardians = isSchoolAdmin || hasRole(roles, "registrar");
  const canUseNotifications = isSchoolAdmin || roles.size > 0;
  const canUseSettings = isSchoolAdmin || roles.size > 0;

  return [
    ...(canManageSchool
      ? [
          {
            id: "dashboard" as const,
            label: translate(locale, "nav.dashboard"),
            path: "/dashboard",
            group: "school" as const,
            icon: Home,
          },
          {
            id: "students" as const,
            label: translate(locale, "nav.students"),
            path: "/students",
            group: "school" as const,
            icon: Users,
          },
          {
            id: "teachers" as const,
            label: translate(locale, "nav.teachers"),
            path: "/teachers",
            group: "school" as const,
            icon: GraduationCap,
          },
          {
            id: "classes" as const,
            label: translate(locale, "nav.classes"),
            path: "/classes",
            group: "school" as const,
            icon: BookOpen,
          },
        ]
      : []),
    ...(canUseLearning
      ? [
          {
            id: "attendance" as const,
            label: translate(locale, "nav.attendance"),
            path: "/attendance",
            group: "learning" as const,
            icon: CalendarDays,
          },
          {
            id: "memorization" as const,
            label: translate(locale, "nav.memorization"),
            path: "/memorization",
            group: "learning" as const,
            icon: BookOpenCheck,
          },
        ]
      : []),
    ...(canViewAcademicReports
      ? [
          {
            id: "academic-reports" as const,
            label: translate(locale, "nav.academicReports"),
            path: "/academic-reports",
            group: "learning" as const,
            icon: ChartNoAxesCombined,
          },
        ]
      : []),
    ...(canUseFinance
      ? [
          {
            id: "finance" as const,
            label: translate(locale, "nav.finance"),
            path: "/finance",
            group: "management" as const,
            icon: DollarSign,
          },
        ]
      : []),
    ...(canUseReceipts
      ? [
          {
            id: "receipts" as const,
            label: translate(locale, "nav.receipts"),
            path: "/receipts",
            group: "management" as const,
            icon: ReceiptText,
          },
        ]
      : []),
    ...(canUseRegistrations
      ? [
          {
            id: "registrations" as const,
            label: translate(locale, "nav.registrations"),
            path: "/registrations",
            group: "management" as const,
            icon: ClipboardList,
          },
        ]
      : []),
    ...(canUseGuardians
      ? [
          {
            id: "guardians" as const,
            label: translate(locale, "nav.guardians"),
            path: "/guardians",
            group: "management" as const,
            icon: UserRoundCheck,
          },
        ]
      : []),
    ...(canUseNotifications
      ? [
          {
            id: "notifications" as const,
            label: translate(locale, "nav.notifications"),
            path: "/notifications",
            group: "management" as const,
            icon: Bell,
          },
        ]
      : []),
    ...(canUseMembers
      ? [
          {
            id: "members" as const,
            label: translate(locale, "nav.members"),
            path: "/members",
            group: "management" as const,
            icon: Users,
          },
        ]
      : []),
    ...(canUseSettings
      ? [
          {
            id: "settings" as const,
            label: translate(locale, "nav.settings"),
            path: "/settings",
            group: "management" as const,
            icon: Settings,
          },
        ]
      : []),
  ];
}

export function getBottomNavigation(
  navigation: readonly AppNavigationItem[]
): AppNavigationItem[] {
  const priority = [
    "dashboard",
    "attendance",
    "students",
    "memorization",
    "notifications",
    "registrations",
    "academic-reports",
    "finance",
    "guardians",
    "members",
  ] as const;

  return priority
    .map(id => navigation.find(item => item.id === id))
    .filter((item): item is AppNavigationItem => Boolean(item))
    .slice(0, 4);
}

export function getCurrentPageLabel(
  path: string,
  navigation: readonly AppNavigationItem[]
): string {
  const match =
    navigation.find(item => item.path === path) ??
    navigation.find(
      item => item.path !== "/dashboard" && path.startsWith(`${item.path}/`)
    );

  return match?.label ?? "QuranOS";
}
