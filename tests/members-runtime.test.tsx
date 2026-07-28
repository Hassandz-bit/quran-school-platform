import React from "react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  auth: {} as Record<string, unknown>,
  access: vi.fn(),
  directory: vi.fn(),
  dashboard: vi.fn(),
  location: vi.fn(),
  path: "/dashboard",
}));

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return {
    ...actual,
    useLocation: () => [mocks.path, mocks.location],
    Redirect: ({ to }: { to: string }) => <div data-testid="redirect">{to}</div>,
  };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/members", async () => {
  const actual = await vi.importActual<typeof import("@/lib/members")>("@/lib/members");
  return {
    ...actual,
    fetchMembersAccess: (...args: unknown[]) => mocks.access(...args),
    fetchMembersDirectory: (...args: unknown[]) => mocks.directory(...args),
  };
});
vi.mock("@/lib/dashboard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/dashboard")>("@/lib/dashboard");
  return {
    ...actual,
    fetchDashboardData: (...args: unknown[]) => mocks.dashboard(...args),
  };
});

import Dashboard from "@/pages/Dashboard";
import MembersRoute from "@/components/MembersRoute";
import Members from "@/pages/Members";

const directory = {
  members: [
    {
      membershipId: "m-admin",
      profileId: "p-admin",
      fullName: "أحمد المدير",
      avatarUrl: null,
      profileStatus: "active" as const,
      membershipStatus: "active" as const,
      joinedAt: "2026-01-10T00:00:00Z",
      membershipCreatedAt: "2026-01-01T00:00:00Z",
      isCurrent: true,
      roles: [
        { assignmentId: "a-admin", roleId: "r-admin", roleCode: "school_admin", roleName: "مدير المدرسة", branchId: null, branchName: null, scope: "school" as const, scopeLabel: "المدرسة كاملة" },
        { assignmentId: "a-teacher", roleId: "r-teacher", roleCode: "teacher", roleName: "معلم", branchId: "b-east", branchName: "الفرع الشرقي", scope: "branch" as const, scopeLabel: "الفرع الشرقي" },
      ],
    },
    {
      membershipId: "m-pending",
      profileId: "p-pending",
      fullName: "سارة المسجلة",
      avatarUrl: null,
      profileStatus: "active" as const,
      membershipStatus: "pending" as const,
      joinedAt: null,
      membershipCreatedAt: "2026-02-01T00:00:00Z",
      isCurrent: false,
      roles: [{ assignmentId: "a-registrar", roleId: "r-registrar", roleCode: "registrar", roleName: "مسجل", branchId: "b-main", branchName: "الفرع الرئيسي", scope: "branch" as const, scopeLabel: "الفرع الرئيسي" }],
    },
    {
      membershipId: "m-disabled",
      profileId: "p-disabled",
      fullName: "يوسف المعطل",
      avatarUrl: null,
      profileStatus: "disabled" as const,
      membershipStatus: "suspended" as const,
      joinedAt: "2026-03-01T00:00:00Z",
      membershipCreatedAt: "2026-02-20T00:00:00Z",
      isCurrent: false,
      roles: [{ assignmentId: "a-finance", roleId: "r-finance", roleCode: "finance_officer", roleName: "مسؤول المالية", branchId: null, branchName: null, scope: "school" as const, scopeLabel: "المدرسة كاملة" }],
    },
    {
      membershipId: "m-none",
      profileId: "p-none",
      fullName: "ليلى بلا دور",
      avatarUrl: null,
      profileStatus: "active" as const,
      membershipStatus: "active" as const,
      joinedAt: "2026-04-01T00:00:00Z",
      membershipCreatedAt: "2026-03-20T00:00:00Z",
      isCurrent: false,
      roles: [],
    },
  ],
  roleOptions: [
    { id: "r-admin", code: "school_admin", name: "مدير المدرسة" },
    { id: "r-teacher", code: "teacher", name: "معلم" },
    { id: "r-registrar", code: "registrar", name: "مسجل" },
    { id: "r-finance", code: "finance_officer", name: "مسؤول المالية" },
  ],
  branchOptions: [
    { id: "b-main", name: "الفرع الرئيسي" },
    { id: "b-east", name: "الفرع الشرقي" },
  ],
};

function resetAuth(overrides: Record<string, unknown> = {}) {
  mocks.auth = {
    session: { user: { id: "p-admin" } },
    user: { id: "p-admin" },
    school: { id: "school-1", name: "مدرسة الاختبار" },
    profile: { id: "p-admin", full_name: "أحمد المدير" },
    membership: { id: "m-admin" },
    roles: [{ id: "r-admin", code: "school_admin" }],
    activeRoleCodes: ["school_admin"],
    isSchoolAdmin: false,
    loading: false,
    authorizationLoading: false,
    authorizationError: null,
    signOut: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
}

describe("read-only members directory runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.path = "/dashboard";
    resetAuth();
    mocks.access.mockResolvedValue({
      canView: true,
      hasMembersView: true,
      hasProfilesView: true,
      viaSchoolAdmin: false,
    });
    mocks.directory.mockResolvedValue(directory);
    mocks.dashboard.mockResolvedValue({
      totalStudents: 0,
      activeClassesCount: 0,
      activeClasses: [],
      branches: [],
    });
  });

  test("shows the dashboard members link only for an authorized user", async () => {
    const first = render(<Dashboard />);
    await waitFor(() => expect(mocks.access).toHaveBeenCalled());
    expect((await screen.findAllByText("أعضاء المدرسة")).length).toBeGreaterThan(0);
    first.unmount();
    mocks.access.mockClear();
    mocks.dashboard.mockClear();

    mocks.access.mockResolvedValue({
      canView: false,
      hasMembersView: true,
      hasProfilesView: false,
      viaSchoolAdmin: false,
    });
    render(<Dashboard />);
    await waitFor(() => expect(mocks.access).toHaveBeenCalledTimes(1));
    await screen.findByText("مرحبًا بك في لوحة التحكم");
    expect(screen.queryByText("أعضاء المدرسة")).not.toBeInTheDocument();
  });

  test("allows school_admin on the dashboard without waiting for permission RPCs", async () => {
    resetAuth({ isSchoolAdmin: true });
    render(<Dashboard />);
    expect((await screen.findAllByText("أعضاء المدرسة")).length).toBeGreaterThan(0);
  });

  test("blocks direct /members access and renders no child data when unauthorized", async () => {
    mocks.path = "/members";
    mocks.access.mockResolvedValue({
      canView: false,
      hasMembersView: false,
      hasProfilesView: true,
      viaSchoolAdmin: false,
    });
    render(
      <MembersRoute>
        <div>بيانات أعضاء سرية</div>
      </MembersRoute>
    );
    expect(await screen.findByText("الوصول غير مسموح")).toBeInTheDocument();
    expect(screen.getByText(/يلزم members.view وprofiles.view معًا/)).toBeInTheDocument();
    expect(screen.queryByText("بيانات أعضاء سرية")).not.toBeInTheDocument();
  });

  test("renders member states and filters by name status role branch and no roles", async () => {
    mocks.path = "/members";
    const user = userEvent.setup();
    render(<Members />);

    expect(await screen.findAllByText("أحمد المدير")).not.toHaveLength(0);
    expect(screen.getAllByText("أنت").length).toBeGreaterThan(0);
    expect(screen.getAllByText("الملف معطل").length).toBeGreaterThan(0);
    expect(screen.getAllByText("قيد الانتظار").length).toBeGreaterThan(0);
    expect(screen.getAllByText("معلق").length).toBeGreaterThan(0);
    expect(screen.getAllByText("لا توجد أدوار مسندة").length).toBeGreaterThan(0);

    const search = screen.getByPlaceholderText("اكتب اسم العضو");
    await user.type(search, "سارة");
    expect(screen.queryByText("أحمد المدير")).not.toBeInTheDocument();
    expect(screen.getAllByText("سارة المسجلة").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "مسح الفلاتر" }));
    await user.selectOptions(screen.getByLabelText("حالة العضوية"), "suspended");
    expect(screen.getAllByText("يوسف المعطل").length).toBeGreaterThan(0);
    expect(screen.queryByText("سارة المسجلة")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "مسح الفلاتر" }));
    await user.selectOptions(screen.getByLabelText("الدور"), "r-teacher");
    expect(screen.getAllByText("أحمد المدير").length).toBeGreaterThan(0);
    expect(screen.queryByText("سارة المسجلة")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "مسح الفلاتر" }));
    await user.selectOptions(screen.getByLabelText("نطاق الفرع"), "b-main");
    expect(screen.getAllByText("سارة المسجلة").length).toBeGreaterThan(0);
    expect(screen.queryByText("يوسف المعطل")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "مسح الفلاتر" }));
    await user.click(screen.getByLabelText("إظهار الأعضاء دون أدوار فقط"));
    expect(screen.getAllByText("ليلى بلا دور").length).toBeGreaterThan(0);
    expect(screen.queryByText("أحمد المدير")).not.toBeInTheDocument();

    for (const label of [
      /دعوة/,
      /إضافة عضو/,
      /^تعديل$/,
      /حذف/,
      /إسناد دور/,
      /إلغاء عضوية/,
    ]) {
      expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
    }
  });
});
