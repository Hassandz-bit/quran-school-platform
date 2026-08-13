import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";

export type NotificationBox = "inbox" | "sent";
export type NotificationCategory =
  | "administration"
  | "teachers"
  | "students"
  | "learning"
  | "attendance"
  | "finance"
  | "guardians"
  | "system";

export type AppNotification = {
  notificationId: string;
  schoolId: string;
  schoolName: string;
  recipientName: string;
  senderName: string | null;
  studentId: string | null;
  studentName: string | null;
  category: NotificationCategory;
  eventType: string;
  title: string;
  body: string;
  targetPath: string | null;
  createdAt: string;
  readAt: string | null;
};

export type NotificationAudience = "staff" | "teachers" | "students" | "guardians";

export type NotificationRecipient = {
  profileId: string;
  fullName: string;
  audienceTypes: NotificationAudience[];
  branchIds: string[];
  classIds: string[];
  relatedStudents: string[];
};

export type ManualNotificationInput = {
  schoolId: string;
  recipientProfileIds: string[];
  category: NotificationCategory;
  title: string;
  body: string;
  targetPath?: string;
  targetingSummary: Record<string, unknown>;
};

export type ManualNotificationResult = {
  campaignId: string;
  recipientCount: number;
};

export type NotificationScopeOption = { id: string; name: string };

export type NotificationSenderKind = "staff" | "teacher" | "guardian";

export type NotificationSenderSchool = {
  schoolId: string;
  schoolName: string;
  senderKind: NotificationSenderKind;
  canGroupSend: boolean;
};

export type NotificationScopes = {
  branches: NotificationScopeOption[];
  classes: Array<NotificationScopeOption & { branchId: string }>;
};

export async function fetchMyNotificationSenderSchools(
  client: SupabaseClient = getSupabaseClient()
): Promise<NotificationSenderSchool[]> {
  const { data, error } = await client.rpc("list_my_notification_sender_schools");
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(row => ({
    schoolId: String(row.school_id),
    schoolName: String(row.school_name),
    senderKind: row.sender_kind as NotificationSenderKind,
    canGroupSend: row.can_group_send === true,
  }));
}

export async function fetchMyNotifications(
  box: NotificationBox,
  category: NotificationCategory | null = null,
  limit = 100,
  client: SupabaseClient = getSupabaseClient()
): Promise<AppNotification[]> {
  const { data, error } = await client.rpc("list_my_app_notifications", {
    target_box: box,
    target_category: category,
    target_limit: limit,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    notificationId: String(row.notification_id),
    schoolId: String(row.school_id),
    schoolName: String(row.school_name),
    recipientName: String(row.recipient_name),
    senderName: row.sender_name ? String(row.sender_name) : null,
    studentId: row.student_id ? String(row.student_id) : null,
    studentName: row.student_name ? String(row.student_name) : null,
    category: row.category as NotificationCategory,
    eventType: String(row.event_type),
    title: String(row.title),
    body: String(row.body),
    targetPath: row.target_path ? String(row.target_path) : null,
    createdAt: String(row.created_at),
    readAt: row.read_at ? String(row.read_at) : null,
  }));
}

export async function fetchUnreadNotificationCount(
  client: SupabaseClient = getSupabaseClient()
): Promise<number> {
  const { data, error } = await client.rpc("get_my_unread_notification_count");
  if (error) return 0;
  return typeof data === "number" && Number.isFinite(data) ? data : 0;
}

export async function markNotificationRead(
  notificationId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<boolean> {
  const { data, error } = await client.rpc("mark_my_app_notification_read", {
    target_notification_id: notificationId,
  });
  return !error && data === true;
}

export async function canSendSchoolNotifications(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<boolean> {
  const { data, error } = await client.rpc("can_send_school_notifications", {
    target_school_id: schoolId,
  });
  if (error) return false;
  return data === true;
}

export async function fetchManualNotificationRecipients(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<NotificationRecipient[]> {
  const { data, error } = await client.rpc("list_manual_notification_recipients", {
    target_school_id: schoolId,
  });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(row => ({
    profileId: String(row.profile_id),
    fullName: String(row.full_name),
    audienceTypes: (Array.isArray(row.audience_types) ? row.audience_types : [])
      .filter((value): value is NotificationAudience =>
        ["staff", "teachers", "students", "guardians"].includes(String(value))
      ),
    branchIds: (Array.isArray(row.branch_ids) ? row.branch_ids : []).map(String),
    classIds: (Array.isArray(row.class_ids) ? row.class_ids : []).map(String),
    relatedStudents: (Array.isArray(row.related_students) ? row.related_students : []).map(String),
  }));
}

export async function fetchNotificationScopes(
  schoolId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<NotificationScopes> {
  const [branchesResult, classesResult] = await Promise.all([
    client.from("branches").select("id, name").eq("school_id", schoolId).eq("status", "active").order("name"),
    client.from("classes").select("id, name, branch_id").eq("school_id", schoolId).eq("status", "active").order("name"),
  ]);
  if (branchesResult.error) throw branchesResult.error;
  if (classesResult.error) throw classesResult.error;
  return {
    branches: (branchesResult.data ?? []).map(row => ({ id: String(row.id), name: String(row.name) })),
    classes: (classesResult.data ?? []).map(row => ({
      id: String(row.id),
      name: String(row.name),
      branchId: String(row.branch_id),
    })),
  };
}

export async function sendManualNotification(
  input: ManualNotificationInput,
  client: SupabaseClient = getSupabaseClient()
): Promise<ManualNotificationResult> {
  const { data, error } = await client.rpc("send_manual_app_notification", {
    target_school_id: input.schoolId,
    target_recipient_profile_ids: [...new Set(input.recipientProfileIds)],
    target_category: input.category,
    target_title: input.title.trim(),
    target_body: input.body.trim(),
    target_path: input.targetPath?.trim() || null,
    target_targeting_summary: input.targetingSummary,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") throw new Error("NOTIFICATION_SEND_EMPTY_RESULT");
  const result = row as Record<string, unknown>;
  return {
    campaignId: String(result.campaign_id),
    recipientCount: Number(result.recipient_count),
  };
}

export const notificationCategoryLabels: Record<NotificationCategory, string> = {
  administration: "الإدارة",
  teachers: "المعلمون",
  students: "الطلاب",
  learning: "التعليم والحفظ",
  attendance: "الحضور",
  finance: "المالية",
  guardians: "الأولياء",
  system: "النظام",
};
