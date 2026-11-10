import { fetchAttendanceRoster, fetchAttendanceScope } from "./attendance.ts";
import { saveOfflineAttendanceRoster, saveOfflineAttendanceScope } from "./attendance-offline.ts";
import {
  fetchMemorizationScope,
  fetchMemorizationWorkspace,
  fetchStudentMemorizationRecords,
  getTodayInputValue,
} from "./memorization.ts";
import {
  saveTeacherMemorizationRecords,
  saveTeacherMemorizationScope,
  saveTeacherMemorizationWorkspace,
  type TeacherOfflineScope,
} from "./teacher-offline.ts";

export type OfflinePreparationProgress = {
  completed: number;
  total: number;
  current: string;
};

export type OfflinePreparationResult = {
  attendanceClasses: number;
  memorizationClasses: number;
  memorizationStudents: number;
  failures: string[];
  preparedAt: string;
};

/**
 * Downloads only the last-online-authorized teacher classes and the minimum
 * records needed for attendance and memorization work on this device.
 * Every later write is still checked by the server at synchronization time.
 */
export async function prepareTeacherOfflineData(
  userId: string,
  schoolId: string,
  onProgress?: (progress: OfflinePreparationProgress) => void
): Promise<OfflinePreparationResult> {
  if (!userId || !schoolId) throw new Error("teacher_offline_identity_missing");
  const recordDate = getTodayInputValue();
  const failures: string[] = [];
  let attendanceClasses = 0;
  let memorizationClasses = 0;
  let memorizationStudents = 0;

  let attendanceTargets: Awaited<ReturnType<typeof fetchAttendanceScope>>["classes"] = [];
  let memorizationTargets: Awaited<ReturnType<typeof fetchMemorizationScope>>["classes"] = [];
  try {
    const attendanceScope = await fetchAttendanceScope(schoolId);
    await saveOfflineAttendanceScope(userId, schoolId, attendanceScope);
    attendanceTargets = attendanceScope.classes.filter(item => item.canManage);
  } catch (error) {
    failures.push(`نطاق الحضور: ${error instanceof Error ? error.message : "تعذر التحميل"}`);
  }
  try {
    const memorizationScope = await fetchMemorizationScope(schoolId);
    await saveTeacherMemorizationScope(userId, schoolId, memorizationScope);
    memorizationTargets = memorizationScope.classes.filter(item => item.canManage);
  } catch (error) {
    failures.push(`نطاق الحفظ: ${error instanceof Error ? error.message : "تعذر التحميل"}`);
  }
  const total = attendanceTargets.length + memorizationTargets.length;
  let completed = 0;

  for (const item of attendanceTargets) {
    try {
      const scope = {
        userId,
        schoolId,
        branchId: item.branchId,
        classId: item.id,
        sessionDate: recordDate,
      };
      const roster = await fetchAttendanceRoster(schoolId, item.branchId, item.id, recordDate);
      await saveOfflineAttendanceRoster(scope, roster);
      attendanceClasses += 1;
    } catch (error) {
      failures.push(`الحضور — ${item.name}: ${error instanceof Error ? error.message : "تعذر التحميل"}`);
    } finally {
      completed += 1;
      onProgress?.({ completed, total, current: item.name });
    }
  }

  for (const item of memorizationTargets) {
    const scope: TeacherOfflineScope = {
      userId,
      schoolId,
      branchId: item.branchId,
      classId: item.id,
      recordDate,
    };
    try {
      const workspace = await fetchMemorizationWorkspace(schoolId, item.branchId, item.id);
      await saveTeacherMemorizationWorkspace(scope, workspace);
      memorizationClasses += 1;
      for (const student of workspace.students) {
        try {
          const records = await fetchStudentMemorizationRecords(
            schoolId,
            item.branchId,
            item.id,
            student.id,
            null
          );
          await saveTeacherMemorizationRecords(scope, student.id, records);
          memorizationStudents += 1;
        } catch (error) {
          failures.push(`سجل ${student.fullName} — ${item.name}: ${error instanceof Error ? error.message : "تعذر التحميل"}`);
        }
      }
    } catch (error) {
      failures.push(`الحفظ — ${item.name}: ${error instanceof Error ? error.message : "تعذر التحميل"}`);
    } finally {
      completed += 1;
      onProgress?.({ completed, total, current: item.name });
    }
  }

  return {
    attendanceClasses,
    memorizationClasses,
    memorizationStudents,
    failures,
    preparedAt: new Date().toISOString(),
  };
}
