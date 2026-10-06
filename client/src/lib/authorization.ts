import type { SupabaseClient } from "@supabase/supabase-js";

export type SchoolProfile = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  locale: string;
  status: string;
};

export type SchoolMembership = {
  id: string;
  school_id: string;
  profile_id: string;
  status: string;
  joined_at: string | null;
};

export type School = {
  id: string;
  name: string;
  slug: string;
  status: string;
  currency_code: string;
  contact_phone: string | null;
  contact_email: string | null;
  address: string | null;
  website_url: string | null;
  logo_path: string | null;
};

export type SchoolRole = {
  id: string;
  school_id: string;
  code: string;
  name_ar: string;
  status: string;
};

type MembershipRole = {
  id: string;
  school_id: string;
  membership_id: string;
  role_id: string;
  branch_id: string | null;
};

export type CurrentAuthorization = {
  profile: SchoolProfile | null;
  membership: SchoolMembership | null;
  school: School | null;
  roles: SchoolRole[];
  activeRoleCodes: string[];
  authorizationError: string | null;
  isSchoolAdmin: boolean;
};

export const AUTHORIZATION_MESSAGES = {
  missingProfile: "لم يكتمل إعداد حسابك بعد.",
  inactiveProfile: "هذا الحساب غير نشط حاليًا.",
  missingMembership: "لا توجد مدرسة نشطة مرتبطة بهذا الحساب.",
  inactiveSchool: "هذه المدرسة غير متاحة حاليًا.",
  missingSchoolAdmin: "لا تملك صلاحية الدخول إلى لوحة إدارة المدرسة.",
  connectionError: "تعذر التحقق من صلاحيات الحساب حاليًا.",
} as const;

function deniedAuthorization(
  authorizationError: string,
  current: Partial<CurrentAuthorization> = {}
): CurrentAuthorization {
  return {
    profile: current.profile ?? null,
    membership: current.membership ?? null,
    school: current.school ?? null,
    roles: current.roles ?? [],
    activeRoleCodes: current.activeRoleCodes ?? [],
    authorizationError,
    isSchoolAdmin: false,
  };
}

function compareMembershipAge(
  left: SchoolMembership,
  right: SchoolMembership
): number {
  if (left.joined_at === right.joined_at) {
    return left.id.localeCompare(right.id);
  }

  if (left.joined_at === null) return 1;
  if (right.joined_at === null) return -1;

  return left.joined_at.localeCompare(right.joined_at);
}

export async function loadCurrentAuthorization(
  client: SupabaseClient,
  userId: string
): Promise<CurrentAuthorization> {
  try {
    const { data: profileData, error: profileError } = await client
      .from("profiles")
      .select("id, full_name, avatar_url, phone, locale, status")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profileData) {
      return deniedAuthorization(AUTHORIZATION_MESSAGES.missingProfile);
    }

    const profile = profileData as SchoolProfile;

    if (profile.status !== "active") {
      return deniedAuthorization(AUTHORIZATION_MESSAGES.inactiveProfile, {
        profile,
      });
    }

    const { data: membershipData, error: membershipError } = await client
      .from("school_memberships")
      .select("id, school_id, profile_id, status, joined_at")
      .eq("profile_id", userId)
      .eq("status", "active");

    if (membershipError) throw membershipError;
    const memberships = (membershipData ?? []).filter(
      (membership): membership is SchoolMembership =>
        membership.profile_id === userId && membership.status === "active"
    );

    if (memberships.length === 0) {
      return deniedAuthorization(AUTHORIZATION_MESSAGES.missingMembership, {
        profile,
      });
    }

    const schoolIds = [
      ...new Set(memberships.map(membership => membership.school_id)),
    ];
    const { data: schoolData, error: schoolError } = await client
      .from("schools")
      // Keep the authentication path compatible while optional branding columns
      // are being rolled out to an existing Supabase project.
      .select("id, name, slug, status, currency_code")
      .in("id", schoolIds);

    if (schoolError) throw schoolError;
    const schools = (schoolData ?? []).map(school => ({
      ...school,
      contact_phone: null,
      contact_email: null,
      address: null,
      website_url: null,
      logo_path: null,
    })) as School[];

    // Branding is optional for authorization. If migration 070 is not present,
    // this query fails harmlessly and the user can still enter the platform.
    const { data: brandingData } = await client
      .from("schools")
      .select("id, contact_phone, contact_email, address, website_url, logo_path")
      .in("id", schoolIds);
    for (const branding of brandingData ?? []) {
      const school = schools.find(item => item.id === branding.id);
      if (school) Object.assign(school, branding);
    }
    const activeSchoolsById = new Map(
      schools
        .filter(school =>
          schoolIds.includes(school.id) && school.status === "active"
        )
        .map(school => [school.id, school])
    );

    if (activeSchoolsById.size === 0) {
      return deniedAuthorization(AUTHORIZATION_MESSAGES.inactiveSchool, {
        profile,
      });
    }

    const { data: membershipRoleData, error: membershipRoleError } =
      await client
        .from("membership_roles")
        .select("id, school_id, membership_id, role_id, branch_id")
        .in(
          "membership_id",
          memberships.map(membership => membership.id)
        )
        .in("school_id", schoolIds);

    if (membershipRoleError) throw membershipRoleError;

    const membershipRoles = (membershipRoleData ?? []) as MembershipRole[];
    const roleIds = [
      ...new Set(membershipRoles.map(assignment => assignment.role_id)),
    ];

    if (roleIds.length === 0) {
      return deniedAuthorization(AUTHORIZATION_MESSAGES.missingSchoolAdmin, {
        profile,
      });
    }

    const { data: roleData, error: roleError } = await client
      .from("roles")
      .select("id, school_id, code, name_ar, status")
      .in("school_id", schoolIds)
      .eq("status", "active")
      .in("id", roleIds);

    if (roleError) throw roleError;

    const activeRolesById = new Map(
      ((roleData ?? []) as SchoolRole[])
        .filter(
          role =>
            role.status === "active" &&
            schoolIds.includes(role.school_id)
        )
        .map(role => [role.id, role])
    );
    const assignmentsByMembershipId = new Map<string, MembershipRole[]>();

    for (const assignment of membershipRoles) {
      const assignments =
        assignmentsByMembershipId.get(assignment.membership_id) ?? [];
      assignments.push(assignment);
      assignmentsByMembershipId.set(assignment.membership_id, assignments);
    }

    const activeMembershipsWithRoles = memberships
      .filter(membership => {
        const school = activeSchoolsById.get(membership.school_id);
        if (!school || school.id !== membership.school_id) return false;

        return (assignmentsByMembershipId.get(membership.id) ?? []).some(
          assignment => {
            const role = activeRolesById.get(assignment.role_id);

            return (
              assignment.membership_id === membership.id &&
              assignment.school_id === membership.school_id &&
              role?.school_id === membership.school_id
            );
          }
        );
      });

    const schoolAdminMemberships = activeMembershipsWithRoles.filter(
      membership =>
        (assignmentsByMembershipId.get(membership.id) ?? []).some(
          assignment => {
            const role = activeRolesById.get(assignment.role_id);

            return (
              assignment.school_id === membership.school_id &&
              assignment.branch_id === null &&
              role?.school_id === membership.school_id &&
              role.code === "school_admin"
            );
          }
        )
    );

    const nonAdminMemberships = activeMembershipsWithRoles.filter(membership =>
      (assignmentsByMembershipId.get(membership.id) ?? []).some(assignment => {
        const role = activeRolesById.get(assignment.role_id);

        return (
          assignment.school_id === membership.school_id &&
          role?.school_id === membership.school_id &&
          role.code !== "school_admin"
        );
      })
    );

    const membership = (
      schoolAdminMemberships.length > 0
        ? schoolAdminMemberships
        : nonAdminMemberships
    ).sort(compareMembershipAge)[0];

    if (!membership) {
      return deniedAuthorization(AUTHORIZATION_MESSAGES.missingSchoolAdmin, {
        profile,
      });
    }

    const school = activeSchoolsById.get(membership.school_id)!;
    const selectedRoleIds = new Set(
      (assignmentsByMembershipId.get(membership.id) ?? [])
        .filter(
          assignment =>
            assignment.school_id === membership.school_id
        )
        .map(assignment => assignment.role_id)
    );
    const roles = [...activeRolesById.values()].filter(
      role =>
        role.school_id === membership.school_id && selectedRoleIds.has(role.id)
    );
    const activeRoleCodes = [...new Set(roles.map(role => role.code))];
    const isSchoolAdmin = (
      assignmentsByMembershipId.get(membership.id) ?? []
    ).some(assignment => {
      const role = activeRolesById.get(assignment.role_id);

      return (
        assignment.school_id === membership.school_id &&
        assignment.branch_id === null &&
        role?.school_id === membership.school_id &&
        role.code === "school_admin"
      );
    });

    return {
      profile,
      membership,
      school,
      roles,
      activeRoleCodes,
      authorizationError: null,
      isSchoolAdmin,
    };
  } catch {
    return deniedAuthorization(AUTHORIZATION_MESSAGES.connectionError);
  }
}
