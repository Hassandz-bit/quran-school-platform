import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, test, vi } from "vitest";
import { createStudentPhotoUrlMap } from "@/lib/students";

describe("student photo URL map", () => {
  test("creates temporary URLs for unique private objects and maps them to student IDs", async () => {
    const createSignedUrls = vi.fn(async (paths: string[]) => ({
      data: paths.map(path => ({ path, signedUrl: `signed:${path}` })),
      error: null,
    }));
    const client = {
      storage: {
        from: vi.fn(() => ({ createSignedUrls })),
      },
    } as unknown as SupabaseClient;

    const result = await createStudentPhotoUrlMap([
      { id: "student-1", photo_path: "school-1/student-1/profile.jpg" },
      { id: "student-2", photo_path: "school-1/student-2/profile.jpg" },
      { id: "student-3", photo_path: null },
    ], client);

    expect(client.storage.from).toHaveBeenCalledWith("student-photos");
    expect(createSignedUrls).toHaveBeenCalledWith([
      "school-1/student-1/profile.jpg",
      "school-1/student-2/profile.jpg",
    ], 3600);
    expect(result).toEqual(new Map([
      ["student-1", "signed:school-1/student-1/profile.jpg"],
      ["student-2", "signed:school-1/student-2/profile.jpg"],
    ]));
  });

  test("returns an empty map when storage signing fails without breaking student lists", async () => {
    const client = {
      storage: {
        from: vi.fn(() => ({ createSignedUrls: vi.fn(async () => ({ data: null, error: new Error("denied") })) })),
      },
    } as unknown as SupabaseClient;

    await expect(createStudentPhotoUrlMap([
      { id: "student-1", photo_path: "school-1/student-1/profile.jpg" },
    ], client)).resolves.toEqual(new Map());
  });
});
