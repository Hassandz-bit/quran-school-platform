import React from "react";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ saveGroup: vi.fn(), success: vi.fn(), error: vi.fn() }));

vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/lib/app-version", () => ({
  assertCurrentAppVersion: vi.fn().mockResolvedValue(undefined),
  isStaleAppVersionError: vi.fn(() => false),
}));
vi.mock("@/lib/memorization", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/memorization")>();
  return {
    ...actual,
    saveMemorizationGroup: (...args: unknown[]) => mocks.saveGroup(...args),
  };
});

import GroupMemorizationEntry from "@/components/GroupMemorizationEntry";
import type { MemorizationStudent, MemorizationTeacher } from "@/lib/memorization";

const students: MemorizationStudent[] = [
  { id: "student-1", fullName: "أحمد الأول", photoUrl: null },
  { id: "student-2", fullName: "أحمد الثاني", photoUrl: null },
];
const teachers: MemorizationTeacher[] = [
  { id: "teacher-1", profileId: "profile-1", fullName: "المعلم" },
];

describe("group memorization entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.saveGroup.mockResolvedValue({ savedCount: 1 });
  });

  test("saves one shared passage with separate student assessments and notes", async () => {
    const onSaved = vi.fn();
    render(
      <GroupMemorizationEntry
        schoolId="school-1"
        branchId="branch-1"
        classId="class-1"
        recordDate="2026-10-04"
        students={students}
        teachers={teachers}
        defaultTeacherId="teacher-1"
        teacherSelectionDisabled
        onSaved={onSaved}
      />
    );

    fireEvent.change(screen.getByLabelText("السورة المشتركة"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("بداية الآيات المشتركة"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("نهاية الآيات المشتركة"), { target: { value: "15" } });

    fireEvent.click(screen.getAllByRole("button", { name: "5" })[0]);
    const notes = screen.getAllByLabelText("ملاحظة الطالب");
    fireEvent.change(notes[0], { target: { value: "إتقان" } });
    fireEvent.change(notes[1], { target: { value: "مراجعة" } });

    const secondStudentLabel = screen.getByText("2. أحمد الثاني").closest("label");
    expect(secondStudentLabel).not.toBeNull();
    fireEvent.click(secondStudentLabel!.querySelector("input[type=checkbox]")!);

    fireEvent.click(screen.getByRole("button", { name: "حفظ المتابعة الجماعية" }));
    await waitFor(() => expect(mocks.saveGroup).toHaveBeenCalledTimes(1));

    const payload = mocks.saveGroup.mock.calls[0][0];
    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0]).toMatchObject({
      studentId: "student-1",
      draft: {
        teacherId: "teacher-1",
        recordDate: "2026-10-04",
        surahNumber: 2,
        ayahStart: 10,
        ayahEnd: 15,
        rating: 5,
        notes: "إتقان",
      },
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("status")).toHaveTextContent("تم حفظ المتابعة الجماعية بنجاح");
    expect(screen.getByRole("button", { name: "تم الحفظ" })).toBeDisabled();
  });
});
