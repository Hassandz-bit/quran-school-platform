export type AuthenticatedRoute = {
  path: "/dashboard" | "/attendance" | "/memorization" | "/finance" | "/members";
  label: string;
};

type DefaultRouteInput = {
  isSchoolAdmin: boolean;
  activeRoleCodes?: readonly string[] | null;
};

const ROUTES = {
  dashboard: { path: "/dashboard", label: "لوحة التحكم" },
  attendance: { path: "/attendance", label: "الحضور" },
  memorization: { path: "/memorization", label: "متابعة الحفظ" },
  finance: { path: "/finance", label: "المالية" },
  members: { path: "/members", label: "أعضاء المدرسة" },
} as const satisfies Record<string, AuthenticatedRoute>;

const ATTENDANCE_ROLE_CODES = new Set([
  "teacher",
  "academic_supervisor",
  "branch_manager",
]);
const MEMORIZATION_ROLE_CODES = new Set([
  "teacher",
  "academic_supervisor",
  "branch_manager",
]);
const FINANCE_ROLE_CODES = new Set(["finance_officer", "branch_manager"]);
const MEMBERS_ROLE_CODES = new Set(["registrar"]);

function hasAnyRole(
  roleCodes: ReadonlySet<string>,
  expectedRoleCodes: ReadonlySet<string>
): boolean {
  for (const code of expectedRoleCodes) {
    if (roleCodes.has(code)) return true;
  }

  return false;
}

export function getDefaultAuthenticatedRoute({
  isSchoolAdmin,
  activeRoleCodes,
}: DefaultRouteInput): AuthenticatedRoute | null {
  if (isSchoolAdmin) return ROUTES.dashboard;

  const roleCodes = new Set(activeRoleCodes ?? []);

  if (hasAnyRole(roleCodes, ATTENDANCE_ROLE_CODES)) {
    return ROUTES.attendance;
  }

  if (hasAnyRole(roleCodes, MEMORIZATION_ROLE_CODES)) {
    return ROUTES.memorization;
  }

  if (hasAnyRole(roleCodes, FINANCE_ROLE_CODES)) {
    return ROUTES.finance;
  }

  if (hasAnyRole(roleCodes, MEMBERS_ROLE_CODES)) {
    return ROUTES.members;
  }

  return null;
}
