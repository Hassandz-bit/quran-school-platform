import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, test, vi } from "vitest";
import { fetchMemorizationWorkspace } from "@/lib/memorization";

describe("memorization workspace teacher RPC", () => {
  test("maps an assigned teacher returned by the RPC into the workspace", async () => {
    const studentsResponse = Promise.resolve({
      data: [
        {
          id: "student-1",
          first_name: "طالب",
          last_name: "الاختبار",
        },
      ],
      error: null,
    });
    const studentsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: studentsResponse.then.bind(studentsResponse),
    };
    const rpc = vi.fn(async (name: string) => {
      if (name === "can_access_memorization_class") {
        return { data: true, error: null };
      }
      if (name === "list_memorization_class_teachers") {
        return {
          data: [
            {
              id: "teacher-1",
              profile_id: "profile-teacher-1",
              first_name: "معلم",
              last_name: "الحلقة",
            },
          ],
          error: null,
        };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    });
    const client = {
      rpc,
      from: vi.fn((table: string) => {
        expect(table).toBe("students");
        return studentsQuery;
      }),
    } as unknown as SupabaseClient;

    const workspace = await fetchMemorizationWorkspace(
      "school-1",
      "branch-1",
      "class-1",
      client,
    );

    expect(rpc).toHaveBeenCalledWith("list_memorization_class_teachers", {
      target_school_id: "school-1",
      target_branch_id: "branch-1",
      target_class_id: "class-1",
    });
    expect(workspace.students).toEqual([
      { id: "student-1", fullName: "طالب الاختبار" },
    ]);
    expect(workspace.teachers).toEqual([
      {
        id: "teacher-1",
        profileId: "profile-teacher-1",
        fullName: "معلم الحلقة",
      },
    ]);
    expect(workspace.teachers).toHaveLength(1);
  });
});
