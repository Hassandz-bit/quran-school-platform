import React from "react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  directory: vi.fn(),
  branchRights: vi.fn(),
  inviteStudents: vi.fn(),
  updateGuardian: vi.fn(),
  location: vi.fn(),
}));

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return { ...actual, useLocation: () => ["/guardians", mocks.location] };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ school: { id: "school-1" } }) }));
vi.mock("@/lib/guardians", async () => {
  const actual = await vi.importActual<typeof import("@/lib/guardians")>("@/lib/guardians");
  return {
    ...actual,
    fetchGuardianManagementAccess: (...args: unknown[]) => mocks.access(...args),
    fetchGuardianDirectory: (...args: unknown[]) => mocks.directory(...args),
    fetchGuardianBranchRights: (...args: unknown[]) => mocks.branchRights(...args),
    fetchGuardianInviteStudents: (...args: unknown[]) => mocks.inviteStudents(...args),
    updateGuardianRelationship: (...args: unknown[]) => mocks.updateGuardian(...args),
  };
});
vi.mock("@/lib/student-import", () => ({ downloadGuardianImportTemplate: vi.fn() }));

import Guardians from "@/pages/Guardians";

const access = { canView: true, canInvite: true, canViewContacts: true, canRevoke: true };
const rows = [
  {
    relationshipId: "rel-1", studentId: "student-1", studentName: "أحمد الأول", branchId: "branch-1", branchName: "الفرع الشمالي", className: "الفوج الأول",
    guardianProfileId: "profile-1", guardianName: "ولي أحمد", guardianEmail: "ahmed@example.test", guardianPhone: null,
    relationshipType: "father" as const, isPrimary: true, relationshipStatus: "pending" as const, invitationStatus: "sent" as const,
    createdAt: "2026-01-01T00:00:00Z", activatedAt: null,
  },
  {
    relationshipId: "rel-2", studentId: "student-2", studentName: "مريم الثانية", branchId: "branch-1", branchName: "الفرع الشمالي", className: "الفوج الثاني",
    guardianProfileId: "profile-2", guardianName: "ولية مريم", guardianEmail: "maryam@example.test", guardianPhone: null,
    relationshipType: "mother" as const, isPrimary: true, relationshipStatus: "active" as const, invitationStatus: "accepted" as const,
    createdAt: "2026-01-01T00:00:00Z", activatedAt: "2026-01-02T00:00:00Z",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue(access);
  mocks.directory.mockResolvedValue(rows);
  mocks.branchRights.mockResolvedValue(new Map([["branch-1", { canEdit: true, canViewContacts: true, canRevoke: true }]]));
  mocks.inviteStudents.mockResolvedValue([]);
  mocks.updateGuardian.mockResolvedValue(undefined);
});

describe("guardian directory cohort and invitation filters", () => {
  test("filters the directory by cohort and invitation status while showing sent, accepted, and active states", async () => {
    const user = userEvent.setup();
    render(<Guardians />);

    expect(await screen.findByText("ولي أحمد")).toBeInTheDocument();
    expect(screen.getAllByText("أُرسلت الدعوة").length).toBeGreaterThan(0);
    expect(screen.getAllByText("قُبلت الدعوة").length).toBeGreaterThan(0);
    expect(screen.getAllByText("نشط").length).toBeGreaterThan(0);

    await user.selectOptions(screen.getByLabelText("الفوج / الحلقة"), "branch-1:الفوج الأول");
    expect(screen.getByText("ولي أحمد")).toBeInTheDocument();
    expect(screen.queryByText("ولية مريم")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("الفوج / الحلقة"), "all");
    await user.selectOptions(screen.getByLabelText("حالة الدعوة / العلاقة"), "accepted");
    expect(screen.getByText("ولية مريم")).toBeInTheDocument();
    expect(screen.queryByText("ولي أحمد")).not.toBeInTheDocument();
  });

  test("edits the guardian name within only this student's relationship", async () => {
    const user = userEvent.setup();
    render(<Guardians />);

    await user.click((await screen.findAllByRole("button", { name: "تعديل بيانات العلاقة" }))[0]);
    const nameInput = await screen.findByLabelText("اسم ولي الأمر");
    await user.clear(nameInput);
    await user.type(nameInput, "اسم محدث");
    await user.click(screen.getByRole("button", { name: "حفظ التعديلات" }));

    expect(mocks.updateGuardian).toHaveBeenCalledWith({
      schoolId: "school-1",
      relationshipId: "rel-1",
      guardianName: "اسم محدث",
      guardianPhone: null,
      relationshipType: "father",
      isPrimary: true,
    });
  });
});
