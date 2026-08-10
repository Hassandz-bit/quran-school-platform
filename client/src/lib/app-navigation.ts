import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  BookOpenCheck,
  ChartNoAxesCombined,
  CalendarDays,
  DollarSign,
  GraduationCap,
  Home,
  UserRoundCheck,
  Users,
} from "lucide-react";

export type AppNavigationInput = {
  isSchoolAdmin: boolean;
  activeRoleCodes: readonly string[];
  canViewMembers?: boolean;
  canViewAcademicReports?: boolean;
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
    | "guardians"
    | "notifications"
    | "members";
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
  const canUseMembers = isSchoolAdmin || canViewMembers;
  const canUseGuardians = isSchoolAdmin || hasRole(roles, "registrar");
  const canUseNotifications = isSchoolAdmin || roles.size > 0;

  return [
    ...(canManageSchool
      ? [
          {
            id: "dashboard" as const,
            label: "الرئيسية",
            path: "/dashboard",
            group: "school" as const,
            icon: Home,
          },
          {
            id: "students" as const,
            label: "الطلاب",
            path: "/students",
            group: "school" as const,
            icon: Users,
          },
          {
            id: "teachers" as const,
            label: "المعلمون",
            path: "/teachers",
            group: "school" as const,
            icon: GraduationCap,
          },
          {
            id: "classes" as const,
            label: "الحلقات",
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
            label: "الحضور",
            path: "/attendance",
            group: "learning" as const,
            icon: CalendarDays,
          },
          {
            id: "memorization" as const,
            label: "الحفظ",
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
            label: "التقارير التعليمية",
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
            label: "المالية",
            path: "/finance",
            group: "management" as const,
            icon: DollarSign,
          },
        ]
      : []),
    ...(canUseGuardians
      ? [
          {
            id: "guardians" as const,
            label: "الأولياء",
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
            label: "الإشعارات",
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
            label: "الأعضاء",
            path: "/members",
            group: "management" as const,
            icon: Users,
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
