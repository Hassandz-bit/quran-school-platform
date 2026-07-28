import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";

export const MEMBER_PROFILE_STATUSES = ["active", "disabled"] as const;
export const MEMBER_MEMBERSHIP_STATUSES = [
  "pending",
  "active",
  "suspended",
] as const;

export type MemberProfileStatus = (typeof MEMBER_PROFILE_STATUSES)[number];
export type MemberMembershipStatus =
  (typeof MEMBER_MEMBERSHIP_STATUSES)[number];
export type MembersPermissionCode = "members.view" | "profiles.view";

export type MembersAccess = {
  canView: boolean;
  hasMembersView: boolean;
  hasProfilesView: boolean;
  viaSchoolAdmin: boolean;
};

export type MemberRoleAssignment = {
  assignmentId: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  branchId: string | null;
  branchName: string | null;
  scope: "school" | "branch";
  scopeLabel: string;
};

export type SchoolMember = {
  membershipId: string;
  profileId: string;
  fullName: string;
  avatarUrl: string | null;
  profileStatus: MemberProfileStatus;
  membershipStatus: MemberMembershipStatus;
  joinedAt: string | null;
  membershipCreatedAt: string;
  roles: MemberRoleAssignment[];
  isCurrent: boolean;
};

export type MemberRoleOption = {
  id: string;
  code: string;
  name: string;
};

export type MemberBranchOption = {
  id: string;
  name: string;
};

export type MembersDirectory = {
  members: SchoolMember[];
  roleOptions: MemberRoleOption[];
  branchOptions: MemberBranchOption[];
};

export type MembersFilters = {
  search: string;
  membershipStatus: "all" | MemberMembershipStatus;
  roleId: "all" | string;
  branchId: "all" | "school-wide" | string;
  withoutRolesOnly: boolean;
};

export type MembersSummary = {
  total: number;
  active: number;
  suspended: number;
  pending: number;
};

type MembershipRow = {
  id: string;
  school_id: string;
  profile_id: string;
  status: string;
  joined_at: string | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  status: string;
};

type MembershipRoleRow = {
  id: string;
  school_id: string;
  membership_id: string;
  role_id: string;
  branch_id: string | null;
};

type RoleRow = {
  id: string;
  school_id: string;
  code: string;
  name_ar: string;
  status: string;
};

type BranchRow = {
  id: string;
  school_id: string;
  name: string;
  status: string;
};

export class MembersPermissionError extends Error {
  constructor() {
    super("members_directory_permission_required");
    this.name = "MembersPermissionError";
  }
}

async function hasSchoolPermission(
  client: SupabaseClient,
  schoolId: string,
  permissionCode: MembersPermissionCode
): Promise<boolean> {
  const { data, error } = await client.rpc("has_school_permission", {
    target_school_id: schoolId,
    target_permission_code: permissionCode,
  });

  if (error) throw error;
  return data === true;
}

export async function fetchMembersAccess(
  schoolId: string,
  isSchoolAdmin = false,
  client: SupabaseClient = getSupabaseClient()
): Promise<MembersAccess> {
  if (isSchoolAdmin) {
    return {
      canView: true,
      hasMembersView: true,
      hasProfilesView: true,
      viaSchoolAdmin: true,
    };
  }

  const [hasMembersView, hasProfilesView] = await Promise.all([
    hasSchoolPermission(client, schoolId, "members.view"),
    hasSchoolPermission(client, schoolId, "profiles.view"),
  ]);

  return {
    canView: hasMembersView && hasProfilesView,
    hasMembersView,
    hasProfilesView,
    viaSchoolAdmin: false,
  };
}

function isMembershipStatus(value: string): value is MemberMembershipStatus {
  return MEMBER_MEMBERSHIP_STATUSES.includes(
    value as MemberMembershipStatus
  );
}

function isProfileStatus(value: string): value is MemberProfileStatus {
  return MEMBER_PROFILE_STATUSES.includes(value as MemberProfileStatus);
}

function normalizedName(value: string | null | undefined): string {
  const name = value?.trim();
  return name || "عضو دون اسم متاح";
}

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export async function fetchMembersDirectory(
  input: {
    schoolId: string;
    currentProfileId: string | null;
    isSchoolAdmin?: boolean;
  },
  client: SupabaseClient = getSupabaseClient()
): Promise<MembersDirectory> {
  const access = await fetchMembersAccess(
    input.schoolId,
    input.isSchoolAdmin === true,
    client
  );

  if (!access.canView) throw new MembersPermissionError();

  const membershipResult = await client
    .from("school_memberships")
    .select(
      "id, school_id, profile_id, status, joined_at, created_at"
    )
    .eq("school_id", input.schoolId)
    .neq("status", "revoked");

  if (membershipResult.error) throw membershipResult.error;

  const memberships = ((membershipResult.data ?? []) as MembershipRow[])
    .filter(
      row =>
        row.school_id === input.schoolId &&
        row.status !== "revoked" &&
        isMembershipStatus(row.status)
    );

  if (memberships.length === 0) {
    return { members: [], roleOptions: [], branchOptions: [] };
  }

  const membershipIds = memberships.map(row => row.id);
  const profileIds = uniqueIds(memberships.map(row => row.profile_id));

  const [profileResult, assignmentResult] = await Promise.all([
    client
      .from("profiles")
      .select("id, full_name, avatar_url, status")
      .in("id", profileIds),
    client
      .from("membership_roles")
      .select(
        "id, school_id, membership_id, role_id, branch_id"
      )
      .eq("school_id", input.schoolId)
      .in("membership_id", membershipIds),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (assignmentResult.error) throw assignmentResult.error;

  const profiles = ((profileResult.data ?? []) as ProfileRow[]).filter(
    row => profileIds.includes(row.id)
  );
  const assignments = (
    (assignmentResult.data ?? []) as MembershipRoleRow[]
  ).filter(
    row =>
      row.school_id === input.schoolId &&
      membershipIds.includes(row.membership_id)
  );

  const roleIds = uniqueIds(assignments.map(row => row.role_id));
  const branchIds = uniqueIds(assignments.map(row => row.branch_id));
  let roles: RoleRow[] = [];
  let branches: BranchRow[] = [];

  if (roleIds.length > 0) {
    const roleResult = await client
      .from("roles")
      .select("id, school_id, code, name_ar, status")
      .eq("school_id", input.schoolId)
      .in("id", roleIds);
    if (roleResult.error) throw roleResult.error;
    roles = ((roleResult.data ?? []) as RoleRow[]).filter(
      row => row.school_id === input.schoolId && roleIds.includes(row.id)
    );
  }

  if (branchIds.length > 0) {
    const branchResult = await client
      .from("branches")
      .select("id, school_id, name, status")
      .eq("school_id", input.schoolId)
      .in("id", branchIds);
    if (branchResult.error) throw branchResult.error;
    branches = ((branchResult.data ?? []) as BranchRow[]).filter(
      row =>
        row.school_id === input.schoolId && branchIds.includes(row.id)
    );
  }

  const profilesById = new Map(profiles.map(row => [row.id, row]));
  const rolesById = new Map(roles.map(row => [row.id, row]));
  const branchesById = new Map(branches.map(row => [row.id, row]));
  const assignmentsByMembership = new Map<
    string,
    MemberRoleAssignment[]
  >();

  for (const assignment of assignments) {
    const role = rolesById.get(assignment.role_id);
    if (!role) continue;

    const branch = assignment.branch_id
      ? branchesById.get(assignment.branch_id)
      : null;
    const roleAssignment: MemberRoleAssignment = {
      assignmentId: assignment.id,
      roleId: role.id,
      roleCode: role.code,
      roleName: normalizedName(role.name_ar),
      branchId: assignment.branch_id,
      branchName: branch?.name?.trim() || null,
      scope: assignment.branch_id === null ? "school" : "branch",
      scopeLabel:
        assignment.branch_id === null
          ? "المدرسة كاملة"
          : branch?.name?.trim() || "فرع غير متاح",
    };
    const current =
      assignmentsByMembership.get(assignment.membership_id) ?? [];
    current.push(roleAssignment);
    assignmentsByMembership.set(assignment.membership_id, current);
  }

  const members = memberships
    .map<SchoolMember>(membership => {
      const profile = profilesById.get(membership.profile_id);
      const memberRoles = (
        assignmentsByMembership.get(membership.id) ?? []
      ).sort((left, right) =>
        `${left.roleName}-${left.scopeLabel}`.localeCompare(
          `${right.roleName}-${right.scopeLabel}`,
          "ar"
        )
      );

      return {
        membershipId: membership.id,
        profileId: membership.profile_id,
        fullName: normalizedName(profile?.full_name),
        avatarUrl: profile?.avatar_url?.trim() || null,
        profileStatus:
          profile && isProfileStatus(profile.status)
            ? profile.status
            : "disabled",
        membershipStatus: membership.status as MemberMembershipStatus,
        joinedAt: membership.joined_at,
        membershipCreatedAt: membership.created_at,
        roles: memberRoles,
        isCurrent: membership.profile_id === input.currentProfileId,
      };
    })
    .sort((left, right) =>
      left.fullName.localeCompare(right.fullName, "ar")
    );

  const roleOptions = [...rolesById.values()]
    .map(role => ({
      id: role.id,
      code: role.code,
      name: normalizedName(role.name_ar),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "ar"));
  const branchOptions = [...branchesById.values()]
    .map(branch => ({ id: branch.id, name: normalizedName(branch.name) }))
    .sort((left, right) => left.name.localeCompare(right.name, "ar"));

  return { members, roleOptions, branchOptions };
}

export function summarizeMembers(members: SchoolMember[]): MembersSummary {
  return members.reduce<MembersSummary>(
    (summary, member) => {
      summary.total += 1;
      summary[member.membershipStatus] += 1;
      return summary;
    },
    { total: 0, active: 0, suspended: 0, pending: 0 }
  );
}

export function filterMembers(
  members: SchoolMember[],
  filters: MembersFilters
): SchoolMember[] {
  const search = filters.search.trim().toLocaleLowerCase("ar");

  return members.filter(member => {
    if (
      search &&
      !member.fullName.toLocaleLowerCase("ar").includes(search)
    ) {
      return false;
    }
    if (
      filters.membershipStatus !== "all" &&
      member.membershipStatus !== filters.membershipStatus
    ) {
      return false;
    }
    if (
      filters.roleId !== "all" &&
      !member.roles.some(role => role.roleId === filters.roleId)
    ) {
      return false;
    }
    if (
      filters.branchId === "school-wide" &&
      !member.roles.some(role => role.branchId === null)
    ) {
      return false;
    }
    if (
      filters.branchId !== "all" &&
      filters.branchId !== "school-wide" &&
      !member.roles.some(role => role.branchId === filters.branchId)
    ) {
      return false;
    }
    if (filters.withoutRolesOnly && member.roles.length !== 0) {
      return false;
    }
    return true;
  });
}

export function isMembersPermissionError(
  error: unknown
): error is MembersPermissionError {
  return error instanceof MembersPermissionError;
}

export function getMembersErrorMessage(error: unknown): string {
  if (isMembersPermissionError(error)) {
    return "لا تملك صلاحية عرض أعضاء المدرسة.";
  }
  return "تعذر تحميل دليل أعضاء المدرسة حاليًا.";
}
