import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MemorizationPermissionError,
  MemorizationValidationError,
  saveMemorizationGroup,
  type MemorizationDraft,
} from "@/lib/memorization";

const sharedDraft = (overrides: Partial<MemorizationDraft> = {}): MemorizationDraft => ({
  recordId: null,
  teacherId: "teacher-1",
  recordDate: "2026-10-04",
  sessionType: "new_memorization",
  surahNumber: 2,
  ayahStart: 10,
  ayahEnd: 15,
  rating: 3,
  errorsCount: 0,
  notes: "",
  nextAssignment: "",
  ...overrides,
});

function createClient(allowedStudentIds = ["student-1", "student-2"]) {
  const insertedRows: Array<Record<string, unknown>> = [];
  const studentsQuery = {
    select: vi.fn(() => studentsQuery),
    eq: vi.fn(() => studentsQuery),
    in: vi.fn(async (_column: string, ids: string[]) => ({
      data: allowedStudentIds.filter(id => ids.includes(id)).map(id => ({ id })),
      error: null,
    })),
  };
  const recordsQuery = {
    insert: vi.fn((rows: Array<Record<string, unknown>>) => {
      insertedRows.push(...rows);
      return {
        select: vi.fn(async () => ({
          data: rows.map((_, index) => ({ id: `record-${index + 1}` })),
          error: null,
        })),
      };
    }),
  };
  const client = {
    rpc: vi.fn(async (name: string) => {
      if (name === "can_access_memorization_class") return { data: true, error: null };
      if (name === "list_memorization_class_teachers") {
        return {
          data: [{ id: "teacher-1", profile_id: "profile-1", first_name: "Teacher", last_name: "One" }],
          error: null,
        };
      }
      throw new Error(`unexpected RPC: ${name}`);
    }),
    from: vi.fn((table: string) => {
      if (table === "students") return studentsQuery;
      if (table === "memorization_records") return recordsQuery;
      throw new Error(`unexpected table: ${table}`);
    }),
  } as unknown as SupabaseClient;
  return { client, insertedRows, recordsQuery };
}

describe("atomic group memorization saves", () => {
  test("saves a shared portion in one insert with individual ratings and notes", async () => {
    const { client, insertedRows, recordsQuery } = createClient();
    const result = await saveMemorizationGroup({
      schoolId: "school-1",
      branchId: "branch-1",
      classId: "class-1",
      entries: [
        { studentId: "student-1", draft: sharedDraft({ rating: 5, notes: "إتقان جيد" }) },
        { studentId: "student-2", draft: sharedDraft({ rating: 2, errorsCount: 3, notes: "يحتاج مراجعة" }) },
      ],
    }, client);

    expect(result).toEqual({ savedCount: 2 });
    expect(recordsQuery.insert).toHaveBeenCalledTimes(1);
    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[0]).toMatchObject({
      class_id: "class-1",
      student_id: "student-1",
      surah_number: 2,
      ayah_start: 10,
      ayah_end: 15,
      rating: 5,
      notes: "إتقان جيد",
    });
    expect(insertedRows[1]).toMatchObject({
      student_id: "student-2",
      surah_number: 2,
      ayah_start: 10,
      ayah_end: 15,
      rating: 2,
      errors_count: 3,
      notes: "يحتاج مراجعة",
    });
  });

  test("rejects a student outside the authorized active class before inserting", async () => {
    const { client, recordsQuery } = createClient(["student-1"]);
    await expect(saveMemorizationGroup({
      schoolId: "school-1",
      branchId: "branch-1",
      classId: "class-1",
      entries: [
        { studentId: "student-1", draft: sharedDraft() },
        { studentId: "student-2", draft: sharedDraft() },
      ],
    }, client)).rejects.toBeInstanceOf(MemorizationPermissionError);
    expect(recordsQuery.insert).not.toHaveBeenCalled();
  });

  test("rejects duplicate student rows and invalid verse ranges", async () => {
    const { client, recordsQuery } = createClient();
    await expect(saveMemorizationGroup({
      schoolId: "school-1",
      branchId: "branch-1",
      classId: "class-1",
      entries: [
        { studentId: "student-1", draft: sharedDraft() },
        { studentId: "student-1", draft: sharedDraft() },
      ],
    }, client)).rejects.toBeInstanceOf(MemorizationValidationError);

    await expect(saveMemorizationGroup({
      schoolId: "school-1",
      branchId: "branch-1",
      classId: "class-1",
      entries: [{ studentId: "student-2", draft: sharedDraft({ surahNumber: 1, ayahEnd: 8 }) }],
    }, client)).rejects.toBeInstanceOf(MemorizationValidationError);
    expect(recordsQuery.insert).not.toHaveBeenCalled();
  });
});
