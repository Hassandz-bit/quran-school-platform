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
