import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase.ts";

export type RegistrationLeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "visit_scheduled"
  | "awaiting_documents"
  | "waitlisted"
  | "accepted"
  | "lost";

export type RegistrationLeadSource =
  | "walk_in"
  | "phone"
  | "website"
  | "social"
  | "referral"
  | "campaign"
  | "other";

export type RegistrationWaitlistReason =
  | "capacity_full"
  | "class_full"
  | "schedule_mismatch"
  | "age_group_full"
  | "documents_pending"
  | "assessment_pending"
  | "other";

export type RegistrationCrmAccess = {
  canView: boolean;
  canManage: boolean;
};

export type RegistrationCrmBranch = {
  branchId: string;
  branchName: string;
  branchCode: string;
  canManage: boolean;
};

export type RegistrationLead = {
  leadId: string;
  branchId: string;
  branchName: string;
  branchCode: string;
  prospectFirstName: string;
  prospectLastName: string;
  birthDate: string | null;
  gender: "male" | "female" | null;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string | null;
  source: RegistrationLeadSource;
  status: RegistrationLeadStatus;
  waitlistedAt: string | null;
  waitlistPriority: 1 | 2 | 3 | null;
  waitlistReason: RegistrationWaitlistReason | null;
  desiredLevel: string | null;
  waitlistRank: number | null;
  nextFollowUpAt: string | null;
  notes: string | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateRegistrationLeadInput = {
  schoolId: string;
  branchId: string;
  prospectFirstName: string;
  prospectLastName: string;
  birthDate?: string | null;
  gender?: "male" | "female" | null;
  guardianName: string;
  guardianPhone: string;
  guardianEmail?: string | null;
  source: RegistrationLeadSource;
  nextFollowUpAt?: string | null;
  notes?: string | null;
};

export type UpdateRegistrationLeadInput = {
  leadId: string;
  status: Exclude<RegistrationLeadStatus, "waitlisted">;
  nextFollowUpAt?: string | null;
  notes?: string | null;
};

export type SetRegistrationLeadWaitlistInput = {
  leadId: string;
  priority: 1 | 2 | 3;
  reason: RegistrationWaitlistReason;
  desiredLevel?: string | null;
  nextFollowUpAt?: string | null;
  notes?: string | null;
};

function mapLead(row: Record<string, unknown>): RegistrationLead {
  const priority = Number(row.waitlist_priority);
  const rank = Number(row.waitlist_rank);

  return {
    leadId: String(row.lead_id),
    branchId: String(row.branch_id),
    branchName: String(row.branch_name),
    branchCode: String(row.branch_code),
    prospectFirstName: String(row.prospect_first_name),
    prospectLastName: String(row.prospect_last_name),
    birthDate: row.birth_date ? String(row.birth_date) : null,
    gender: row.gender === "male" || row.gender === "female" ? row.gender : null,
    guardianName: String(row.guardian_name),
    guardianPhone: String(row.guardian_phone),
    guardianEmail: row.guardian_email ? String(row.guardian_email) : null,
    source: row.source as RegistrationLeadSource,
    status: row.lead_status as RegistrationLeadStatus,
    waitlistedAt: row.waitlisted_at ? String(row.waitlisted_at) : null,
    waitlistPriority: priority === 1 || priority === 2 || priority === 3 ? priority : null,
    waitlistReason: row.waitlist_reason ? row.waitlist_reason as RegistrationWaitlistReason : null,
    desiredLevel: row.desired_level ? String(row.desired_level) : null,
    waitlistRank: Number.isFinite(rank) && rank > 0 ? rank : null,
    nextFollowUpAt: row.next_follow_up_at ? String(row.next_follow_up_at) : null,
    notes: row.notes ? String(row.notes) : null,
    createdByName: String(row.created_by_name),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function fetchRegistrationCrmAccess(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<RegistrationCrmAccess> {
  const { data, error } = await client.rpc("get_registration_crm_access", {
    target_school_id: schoolId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  return {
    canView: row?.can_view === true,
    canManage: row?.can_manage === true,
  };
}

export async function listRegistrationCrmBranches(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<RegistrationCrmBranch[]> {
  const { data, error } = await client.rpc("list_registration_crm_branches", {
    target_school_id: schoolId,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    branchId: String(row.branch_id),
    branchName: String(row.branch_name),
    branchCode: String(row.branch_code),
    canManage: row.can_manage === true,
  }));
}

export async function listRegistrationLeads(
  schoolId: string,
  status: RegistrationLeadStatus | null = null,
  client: SupabaseClient = getSupabaseClient()
): Promise<RegistrationLead[]> {
  const { data, error } = await client.rpc("list_registration_leads", {
    target_school_id: schoolId,
    target_status: status,
    target_limit: 500,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => mapLead(row));
}

export async function createRegistrationLead(
  input: CreateRegistrationLeadInput,
  client: SupabaseClient = getSupabaseClient()
): Promise<string> {
  const { data, error } = await client.rpc("create_registration_lead", {
    target_school_id: input.schoolId,
    target_branch_id: input.branchId,
    target_prospect_first_name: input.prospectFirstName,
    target_prospect_last_name: input.prospectLastName,
    target_birth_date: input.birthDate || null,
    target_gender: input.gender || null,
    target_guardian_name: input.guardianName,
    target_guardian_phone: input.guardianPhone,
    target_guardian_email: input.guardianEmail || null,
    target_source: input.source,
    target_next_follow_up_at: input.nextFollowUpAt || null,
    target_notes: input.notes || null,
  });
  if (error) throw error;
  if (!data) throw new Error("registration_crm_create_failed");
  return String(data);
}

export async function updateRegistrationLeadPipeline(
  input: UpdateRegistrationLeadInput,
  client: SupabaseClient = getSupabaseClient()
): Promise<void> {
  const { data, error } = await client.rpc("update_registration_lead_pipeline", {
    target_lead_id: input.leadId,
    target_status: input.status,
    target_next_follow_up_at: input.nextFollowUpAt || null,
    target_notes: input.notes || null,
  });
  if (error) throw error;
  if (data !== true) throw new Error("registration_crm_update_failed");
}

export async function setRegistrationLeadWaitlist(
  input: SetRegistrationLeadWaitlistInput,
  client: SupabaseClient = getSupabaseClient()
): Promise<void> {
  const { data, error } = await client.rpc("set_registration_lead_waitlist", {
    target_lead_id: input.leadId,
    target_priority: input.priority,
    target_reason: input.reason,
    target_desired_level: input.desiredLevel || null,
    target_next_follow_up_at: input.nextFollowUpAt || null,
    target_notes: input.notes || null,
  });
  if (error) throw error;
  if (data !== true) throw new Error("registration_waitlist_update_failed");
}
