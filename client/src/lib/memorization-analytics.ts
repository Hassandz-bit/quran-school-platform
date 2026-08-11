import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MEMORIZATION_FOLLOW_UP_CATEGORIES,
  MEMORIZATION_FOLLOW_UP_STATUSES,
  type MemorizationFollowUpCategory,
  type MemorizationFollowUpPriority,
  type MemorizationFollowUpStatus,
} from "./memorization-follow-up";
import { getSupabaseClient } from "./supabase";

export type MemorizationAnalyticsFilters = {
  branchId: string;
  classId: string;
  studentId: string;
  dateFrom: string;
  dateTo: string;
  category: "" | MemorizationFollowUpCategory;
  status: "" | MemorizationFollowUpStatus;
  priority: "" | "1" | "2" | "3";
  limit?: number;
};

export type MemorizationAnalyticsOverview = {
  observationCount: number;
  studentCount: number;
  openCount: number;
  improvedCount: number;
  resolvedCount: number;
  highPriorityUnresolvedCount: number;
  recurringSignatureCount: number;
};
export type MemorizationAnalyticsCategory = { category: MemorizationFollowUpCategory; observationCount: number; unresolvedCount: number; studentCount: number; };
export type MemorizationAnalyticsLocation = { surahNumber: number; ayahStart: number; ayahEnd: number; observationCount: number; unresolvedCount: number; studentCount: number; };
export type MemorizationAnalyticsStudent = { studentId: string; studentName: string; branchId: string; classId: string; className: string; observationCount: number; unresolvedCount: number; highPriorityUnresolvedCount: number; recurringSignatureCount: number; };
export type MemorizationAnalyticsTrendPoint = { eventDate: string; improvedEvents: number; resolvedEvents: number; reopenedEvents: number; };
export type MemorizationAnalyticsHighPriorityItem = { id: string; studentId: string; studentName: string; branchId: string; classId: string; className: string; category: MemorizationFollowUpCategory; status: MemorizationFollowUpStatus; priority: MemorizationFollowUpPriority; surahNumber: number; ayahStart: number; ayahEnd: number; noteText: string; observedOn: string; recurrenceCount: number; };
export type MemorizationAnalyticsData = { overview: MemorizationAnalyticsOverview; categories: MemorizationAnalyticsCategory[]; locations: MemorizationAnalyticsLocation[]; students: MemorizationAnalyticsStudent[]; trend: MemorizationAnalyticsTrendPoint[]; recentHighPriority: MemorizationAnalyticsHighPriorityItem[]; };

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("memorization_analytics_invalid_server_payload");
  return value as Record<string, unknown>;
}
function arrayValue(value: unknown): unknown[] { if (!Array.isArray(value)) throw new Error("memorization_analytics_invalid_server_payload"); return value; }
function stringValue(value: unknown): string { if (typeof value !== "string") throw new Error("memorization_analytics_invalid_server_payload"); return value; }
function numberValue(value: unknown): number { const normalized = typeof value === "number" ? value : Number(value); if (!Number.isFinite(normalized)) throw new Error("memorization_analytics_invalid_server_payload"); return normalized; }
function categoryValue(value: unknown): MemorizationFollowUpCategory { const normalized = stringValue(value); if (!(MEMORIZATION_FOLLOW_UP_CATEGORIES as readonly string[]).includes(normalized)) throw new Error("memorization_analytics_invalid_server_payload"); return normalized as MemorizationFollowUpCategory; }
function statusValue(value: unknown): MemorizationFollowUpStatus { const normalized = stringValue(value); if (!(MEMORIZATION_FOLLOW_UP_STATUSES as readonly string[]).includes(normalized)) throw new Error("memorization_analytics_invalid_server_payload"); return normalized as MemorizationFollowUpStatus; }
function priorityValue(value: unknown): MemorizationFollowUpPriority { const normalized = numberValue(value); if (normalized !== 1 && normalized !== 2 && normalized !== 3) throw new Error("memorization_analytics_invalid_server_payload"); return normalized; }

function mapOverview(value: unknown): MemorizationAnalyticsOverview { const row = objectValue(value); return { observationCount:numberValue(row.observation_count),studentCount:numberValue(row.student_count),openCount:numberValue(row.open_count),improvedCount:numberValue(row.improved_count),resolvedCount:numberValue(row.resolved_count),highPriorityUnresolvedCount:numberValue(row.high_priority_unresolved_count),recurringSignatureCount:numberValue(row.recurring_signature_count) }; }
function mapCategory(value: unknown): MemorizationAnalyticsCategory { const row=objectValue(value); return {category:categoryValue(row.category),observationCount:numberValue(row.observation_count),unresolvedCount:numberValue(row.unresolved_count),studentCount:numberValue(row.student_count)}; }
function mapLocation(value: unknown): MemorizationAnalyticsLocation { const row=objectValue(value); return {surahNumber:numberValue(row.surah_number),ayahStart:numberValue(row.ayah_start),ayahEnd:numberValue(row.ayah_end),observationCount:numberValue(row.observation_count),unresolvedCount:numberValue(row.unresolved_count),studentCount:numberValue(row.student_count)}; }
function mapStudent(value: unknown): MemorizationAnalyticsStudent { const row=objectValue(value); return {studentId:stringValue(row.student_id),studentName:stringValue(row.student_name),branchId:stringValue(row.branch_id),classId:stringValue(row.class_id),className:stringValue(row.class_name),observationCount:numberValue(row.observation_count),unresolvedCount:numberValue(row.unresolved_count),highPriorityUnresolvedCount:numberValue(row.high_priority_unresolved_count),recurringSignatureCount:numberValue(row.recurring_signature_count)}; }
function mapTrend(value: unknown): MemorizationAnalyticsTrendPoint { const row=objectValue(value); return {eventDate:stringValue(row.event_date),improvedEvents:numberValue(row.improved_events),resolvedEvents:numberValue(row.resolved_events),reopenedEvents:numberValue(row.reopened_events)}; }
function mapHighPriority(value: unknown): MemorizationAnalyticsHighPriorityItem { const row=objectValue(value); return {id:stringValue(row.id),studentId:stringValue(row.student_id),studentName:stringValue(row.student_name),branchId:stringValue(row.branch_id),classId:stringValue(row.class_id),className:stringValue(row.class_name),category:categoryValue(row.category),status:statusValue(row.status),priority:priorityValue(row.priority),surahNumber:numberValue(row.surah_number),ayahStart:numberValue(row.ayah_start),ayahEnd:numberValue(row.ayah_end),noteText:stringValue(row.note_text),observedOn:stringValue(row.observed_on),recurrenceCount:numberValue(row.recurrence_count)}; }

export function mapMemorizationAnalyticsPayload(value: unknown): MemorizationAnalyticsData {
  const payload=objectValue(value);
  return { overview:mapOverview(payload.overview), categories:arrayValue(payload.categories).map(mapCategory), locations:arrayValue(payload.locations).map(mapLocation), students:arrayValue(payload.students).map(mapStudent), trend:arrayValue(payload.trend).map(mapTrend), recentHighPriority:arrayValue(payload.recent_high_priority).map(mapHighPriority) };
}

function validateFilters(filters: MemorizationAnalyticsFilters): void {
  const datePattern=/^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(filters.dateFrom) || !datePattern.test(filters.dateTo) || filters.dateFrom > filters.dateTo) throw new Error("memorization_analytics_invalid_date_range");
  if (filters.category && !(MEMORIZATION_FOLLOW_UP_CATEGORIES as readonly string[]).includes(filters.category)) throw new Error("memorization_analytics_invalid_category");
  if (filters.status && !(MEMORIZATION_FOLLOW_UP_STATUSES as readonly string[]).includes(filters.status)) throw new Error("memorization_analytics_invalid_status");
  if (filters.priority && !["1","2","3"].includes(filters.priority)) throw new Error("memorization_analytics_invalid_priority");
  const limit=filters.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("memorization_analytics_invalid_limit");
}

export async function fetchMemorizationAnalytics(schoolId:string,filters:MemorizationAnalyticsFilters,client:SupabaseClient=getSupabaseClient()):Promise<MemorizationAnalyticsData> {
  if (!schoolId) throw new Error("memorization_analytics_school_required");
  validateFilters(filters);
  const {data,error}=await client.rpc("get_memorization_follow_up_analytics",{
    target_school_id:schoolId,target_branch_id:filters.branchId||null,target_class_id:filters.classId||null,target_student_id:filters.studentId||null,
    target_date_from:filters.dateFrom,target_date_to:filters.dateTo,target_category:filters.category||null,target_status:filters.status||null,
    target_priority:filters.priority?Number(filters.priority):null,target_limit:filters.limit??10,
  });
  if (error) throw error;
  return mapMemorizationAnalyticsPayload(data);
}
