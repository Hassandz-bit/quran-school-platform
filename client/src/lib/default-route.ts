export type AuthenticatedRoute = {
  path: "/dashboard" | "/attendance" | "/memorization" | "/finance" | "/members";
  label: string;
};

type DefaultRouteInput = {
  isSchoolAdmin: boolean;
  activeRoleCodes?: readonly string[] | null;
};

const ROUTES = {
  dashboard: { path: "/dashboard", label: "لوحة الإدارة" },
  attendance: { path: "/attendance", label: "الحضور" },
  memorization: { path: "/memorization", label: "متابعة الحفظ" },
  finance: { path: "/finance", label: "البوابة المالية" },
  members: { path: "/members", label: "إدارة الأعضاء" },
} as const satisfies Record<string, AuthenticatedRoute>;

const ATTENDANCE_ROLE_CODES = new Set(["teacher", "academic_supervisor", "branch_manager"]);
const FINANCE_ROLE_CODES = new Set(["finance_officer", "branch_manager"]);
const MEMBERS_ROLE_CODES = new Set(["registrar"]);

function hasAnyRole(roleCodes: ReadonlySet<string>, expectedRoleCodes: ReadonlySet<string>): boolean {
  for (const code of expectedRoleCodes) {
    if (roleCodes.has(code)) return true;
  }
  return false;
}

/**
 * Returns every distinct portal supported by the verified active membership.
 * A user with more than one portal must choose explicitly; never silently
 * prefer the administrator portal over the teacher portal.
 */
export function getAvailableAuthenticatedRoutes({
  isSchoolAdmin,
  activeRoleCodes,
}: DefaultRouteInput): AuthenticatedRoute[] {
  const roleCodes = new Set(activeRoleCodes ?? []);
  const routes: AuthenticatedRoute[] = [];

  if (isSchoolAdmin) routes.push(ROUTES.dashboard);
  if (hasAnyRole(roleCodes, ATTENDANCE_ROLE_CODES)) routes.push(ROUTES.attendance);
  if (hasAnyRole(roleCodes, FINANCE_ROLE_CODES)) routes.push(ROUTES.finance);
  if (hasAnyRole(roleCodes, MEMBERS_ROLE_CODES)) routes.push(ROUTES.members);

  return routes.filter((route, index, all) =>
    all.findIndex(candidate => candidate.path === route.path) === index
  );
}

export function getDefaultAuthenticatedRoute(input: DefaultRouteInput): AuthenticatedRoute | null {
  return getAvailableAuthenticatedRoutes(input)[0] ?? null;
}
