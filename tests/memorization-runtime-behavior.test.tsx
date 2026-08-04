import React from "react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  records: vi.fn(),
  location: vi.fn(),
  updateCalls: 0,
  insertCalls: 0,
  recordCount: 1,
}));

const existingRecord = {
  id: "record-existing-12345678",
  studentId: "student-1",
  teacherId: "teacher-1",
  recordDate: "2026-07-28",
  sessionType: "new_memorization" as const,
  surahNumber: 1,
  ayahStart: 1,
  ayahEnd: 4,
  rating: 4,
  errorsCount: 1,
  notes: "ملاحظة قائمة",
  nextAssignment: "واجب قائم",
  createdAt: "2026-07-28T09:00:00.000Z",
  updatedAt: "2026-07-28T09:00:00.000Z",
};

vi.mock("wouter", () => ({ useLocation: () => ["/memorization", mocks.location] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    school: { id: "school-1", name: "مدرسة الاختبار" },
    session: { user: { id: "profile-admin" } },
    membership: { id: "membership-1" },
    roles: [{ id: "role-admin", code: "school_admin" }],
    isSchoolAdmin: true,
    signOut: vi.fn().mockResolvedValue({ error: null }),
  }),
}));
vi.mock("@/lib/memorization-manager-scope", () => ({
  fetchMemorizationManagerScope: vi.fn().mockResolvedValue({ schoolWide: true, branchIds: [] }),
}));
vi.mock("@/lib/memorization", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/memorization")>();
  return {
    ...actual,
    fetchMemorizationScope: vi.fn().mockResolvedValue({
      canView: true,
      canManage: true,
      branches: [{ id: "branch-1", name: "الفرع", isMain: true, canManage: true }],
      classes: [{ id: "class-1", branchId: "branch-1", name: "الحلقة", scheduleLabel: null, canManage: true }],
    }),
    fetchMemorizationWorkspace: vi.fn().mockResolvedValue({
      students: [{ id: "student-1", fullName: "طالب الاختبار" }],
      teachers: [{ id: "teacher-1", profileId: null, fullName: "معلم الاختبار" }],
    }),
    fetchStudentMemorizationRecords: (...args: unknown[]) => mocks.records(...args),
    fetchMemorizationAudit: vi.fn().mockResolvedValue([]),
    saveMemorizationRecord: (...args: unknown[]) => mocks.save(...args),
    getTodayInputValue: () => "2026-07-28",
  };
});

import Memorization from "@/pages/Memorization";

describe("memorization edit runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.scrollTo = vi.fn();
    existingRecord.ayahEnd = 4;
    mocks.updateCalls = 0;
    mocks.insertCalls = 0;
    mocks.recordCount = 1;
    mocks.records.mockResolvedValue([existingRecord]);
    mocks.save.mockImplementation(async input => {
      const typed = input as { draft: { recordId: string | null; ayahEnd: number } };
      if (typed.draft.recordId) {
        mocks.updateCalls += 1;
        existingRecord.ayahEnd = typed.draft.ayahEnd;
        return { recordId: typed.draft.recordId, mode: "updated" };
      }
      mocks.insertCalls += 1;
      mocks.recordCount += 1;
      return { recordId: "unexpected-new-record", mode: "created" };
    });
  });

  test("clicking Edit then Save performs one update, no insert, and keeps edit mode", async () => {
    const user = userEvent.setup();
    render(<Memorization />);

    expect(await screen.findByText("معلم الاختبار")).toBeInTheDocument();
    expect(screen.queryByText("لا يوجد معلم معيّن للحلقة")).not.toBeInTheDocument();

    const editButton = await screen.findByRole("button", { name: "تعديل" });
    expect(screen.getAllByRole("button", { name: "تعديل" })).toHaveLength(1);
    await user.click(editButton);

    expect(await screen.findByText(/^وضع التعديل ·/)).toHaveTextContent("record-e");
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(screen.getByText(/^وضع التعديل ·/)).toBeInTheDocument();

    const ayahEnd = screen
      .getAllByRole("spinbutton")
      .find(element => (element as HTMLInputElement).value === "4") as HTMLInputElement;
    expect(ayahEnd).toBeDefined();
    fireEvent.change(ayahEnd, { target: { value: "5" } });
    await waitFor(() => expect(ayahEnd).toHaveValue(5));

    const saveButton = screen.getByRole("button", { name: "حفظ التعديل" });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    const savedInput = mocks.save.mock.calls[0][0];
    expect(savedInput.draft.recordId).toBe(existingRecord.id);
    expect(savedInput.draft.ayahEnd).toBe(5);
    expect(mocks.updateCalls).toBe(1);
    expect(mocks.insertCalls).toBe(0);
    expect(mocks.recordCount).toBe(1);
    expect(screen.getByText("تم تحديث سجل المتابعة بنجاح.")).toBeInTheDocument();
    expect(screen.getByText(/^وضع التعديل ·/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "حفظ التعديل" })).toBeDisabled();

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "تعديل" })).toHaveLength(1);
      expect(screen.getByText(/إلى 5/)).toBeInTheDocument();
    });
  });
});
