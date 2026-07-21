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
};

export type SchoolRole = {
  id: string;
  school_id: string;
  code: string;
  name_ar: string;
  status: string;
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
      .eq("status", "active")
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membershipData) {
      return deniedAuthorization(AUTHORIZATION_MESSAGES.missingMembership, {
        profile,
      });
    }

    const membership = membershipData as SchoolMembership;
    const { data: schoolData, error: schoolError } = await client
      .from("schools")
      .select("id, name, slug, status")
      .eq("id", membership.school_id)
      .maybeSingle();

    if (schoolError) throw schoolError;
    if (!schoolData || schoolData.status !== "active") {
      return deniedAuthorization(AUTHORIZATION_MESSAGES.inactiveSchool, {
        profile,
        membership,
      });
    }

    const school = schoolData as School;
    const { data: membershipRoleData, error: membershipRoleError } =
      await client
        .from("membership_roles")
        .select("id, school_id, membership_id, role_id, branch_id")
        .eq("school_id", school.id)
        .eq("membership_id", membership.id)
        .is("branch_id", null);

    if (membershipRoleError) throw membershipRoleError;

    const roleIds = [
      ...new Set((membershipRoleData ?? []).map(item => item.role_id)),
    ];

    if (roleIds.length === 0) {
      return deniedAuthorization(AUTHORIZATION_MESSAGES.missingSchoolAdmin, {
        profile,
        membership,
        school,
      });
    }

    const { data: roleData, error: roleError } = await client
      .from("roles")
      .select("id, school_id, code, name_ar, status")
      .eq("school_id", school.id)
      .eq("status", "active")
      .in("id", roleIds);

    if (roleError) throw roleError;

    const roles = (roleData ?? []) as SchoolRole[];
    const activeRoleCodes = [...new Set(roles.map(role => role.code))];
    const isSchoolAdmin = activeRoleCodes.includes("school_admin");

    return {
      profile,
      membership,
      school,
      roles,
      activeRoleCodes,
      authorizationError: isSchoolAdmin
        ? null
        : AUTHORIZATION_MESSAGES.missingSchoolAdmin,
      isSchoolAdmin,
    };
  } catch {
    return deniedAuthorization(AUTHORIZATION_MESSAGES.connectionError);
  }
}
