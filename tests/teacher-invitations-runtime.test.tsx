import React from "react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  auth: {} as Record<string, unknown>,
  access: vi.fn(),
  eligible: vi.fn(),
  invite: vi.fn(),
  context: vi.fn(),
  accepted: vi.fn(),
  inviteSession: true,
  clearInviteSession: vi.fn(),
  location: vi.fn(),
}));

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return { ...actual, useLocation: () => ["/members", mocks.location] };
});

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.auth }));

vi.mock("@/lib/invite-session", () => ({
  hasTeacherInviteSession: () => mocks.inviteSession,
  clearTeacherInviteSession: () => mocks.clearInviteSession(),
}));

vi.mock("@/lib/teacher-invitations", async () => {
  const actual = await vi.importActual<typeof import("@/lib/teacher-invitations")>(
    "@/lib/teacher-invitations"
  );
  return {
    ...actual,
    fetchTeacherInvitationAccess: (...args: unknown[]) => mocks.access(...args),
    fetchEligibleTeacherInvitations: (...args: unknown[]) => mocks.eligible(...args),
    inviteExistingTeacher: (...args: unknown[]) => mocks.invite(...args),
    fetchMyTeacherInvitationContext: (...args: unknown[]) => mocks.context(...args),
    markMyTeacherInvitationAccepted: (...args: unknown[]) => mocks.accepted(...args),
  };
});

import TeacherInvitationDialog from "@/components/TeacherInvitationDialog";
import ProtectedRoute from "@/components/ProtectedRoute";
import AcceptInvite from "@/pages/AcceptInvite";
import Login from "@/pages/Login";
import PostLoginRedirect from "@/pages/PostLoginRedirect";
import ResetPassword from "@/pages/ResetPassword";
import { TeacherInvitationError } from "@/lib/teacher-invitations";

const teacher = {
  teacherId: "22222222-2222-4222-8222-222222222222",
  schoolId: "11111111-1111-4111-8111-111111111111",
  branchId: "33333333-3333-4333-8333-333333333333",
  fullName: "معلم الاختبار",
  branchName: "الفرع الرئيسي",
  classNames: ["حلقة الفجر"],
  existingEmail: null,
  roleLabel: "المعلم" as const,
};

function resetAuth(overrides: Record<string, unknown> = {}) {
  mocks.auth = {
    school: { id: teacher.schoolId, name: "مدرسة الاختبار" },
    session: { user: { id: "44444444-4444-4444-8444-444444444444" } },
    loading: false,
    signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
    updateUser: vi.fn().mockResolvedValue({ error: null }),
    reloadAuthorization: vi.fn().mockResolvedValue(undefined),
    isPasswordRecovery: false,
    clearPasswordRecovery: vi.fn(),
    ...overrides,
  };
}

function allowAll() {
  return {
    canInvite: true,
    permissions: {
      "members.manage": true,
      "members.assign_roles": true,
      "teachers.manage": true,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAuth();
  mocks.access.mockResolvedValue(allowAll());
  mocks.eligible.mockResolvedValue([teacher]);
  mocks.invite.mockResolvedValue({ invitationId: "invite-1", status: "sent" });
  mocks.context.mockResolvedValue({
    invitationId: "invite-1",
    schoolName: "مدرسة الاختبار",
    teacherName: teacher.fullName,
    branchName: teacher.branchName,
    status: "sent",
  });
  mocks.accepted.mockResolvedValue(true);
  mocks.inviteSession = true;
});

describe("teacher invitation dialog", () => {
  test("shows the invite button only when all three permissions are present", async () => {
    const first = render(<TeacherInvitationDialog />);
    expect(await screen.findByRole("button", { name: "دعوة معلم" })).toBeInTheDocument();
    first.unmount();

    mocks.access.mockResolvedValue({
      canInvite: false,
      permissions: {
        "members.manage": true,
        "members.assign_roles": false,
        "teachers.manage": true,
      },
    });
    render(<TeacherInvitationDialog />);
    await waitFor(() => expect(mocks.access).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "دعوة معلم" })).not.toBeInTheDocument();
  });

  test("shows teacher, branch, classes and fixed role as read-only context", async () => {
    const user = userEvent.setup();
    render(<TeacherInvitationDialog />);
    await user.click(await screen.findByRole("button", { name: "دعوة معلم" }));
    expect(await screen.findByText(teacher.fullName)).toBeInTheDocument();
    expect(screen.getByText(teacher.branchName)).toBeInTheDocument();
    expect(screen.getByText("حلقة الفجر")).toBeInTheDocument();
    expect(screen.getAllByText("المعلم").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(screen.queryByLabelText(/الدور/)).not.toBeInTheDocument();
  });

  test("validates missing and invalid email before invoking the function", async () => {
    const user = userEvent.setup();
    render(<TeacherInvitationDialog />);
    await user.click(await screen.findByRole("button", { name: "دعوة معلم" }));
    await screen.findByText(teacher.fullName);
    await user.click(screen.getByRole("button", { name: "إرسال الدعوة" }));
    expect(await screen.findByText("البريد مطلوب لإرسال الدعوة.")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("teacher@example.com"), "bad-email");
    await user.click(screen.getByRole("button", { name: "إرسال الدعوة" }));
    expect(await screen.findByText("أدخل بريدًا إلكترونيًا صالحًا.")).toBeInTheDocument();
    expect(mocks.invite).not.toHaveBeenCalled();
  });

  test("prevents double submit and keeps one idempotency key", async () => {
    let resolveInvite!: () => void;
    mocks.invite.mockImplementation(
      () => new Promise(resolve => {
        resolveInvite = () => resolve({ invitationId: "invite-1", status: "sent" });
      })
    );
    const user = userEvent.setup();
    render(<TeacherInvitationDialog />);
    await user.click(await screen.findByRole("button", { name: "دعوة معلم" }));
    await user.type(screen.getByPlaceholderText("teacher@example.com"), "teacher@example.test");
    const submit = screen.getByRole("button", { name: "إرسال الدعوة" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(mocks.invite).toHaveBeenCalledTimes(1);
    expect(mocks.invite.mock.calls[0][1]).toMatch(/^[0-9a-f-]{36}$/i);
    resolveInvite();
    expect(await screen.findByText(/تم تجهيز الدعوة بأمان/)).toBeInTheDocument();
  });

  test("shows safe duplicate and delivery errors", async () => {
    const user = userEvent.setup();
    mocks.invite.mockRejectedValueOnce(
      new TeacherInvitationError("invitation_already_exists")
    );
    render(<TeacherInvitationDialog />);
    await user.click(await screen.findByRole("button", { name: "دعوة معلم" }));
    await user.type(screen.getByPlaceholderText("teacher@example.com"), "teacher@example.test");
    await user.click(screen.getByRole("button", { name: "إرسال الدعوة" }));
    expect(await screen.findByText("توجد دعوة نشطة لهذا المعلم أو البريد.")).toBeInTheDocument();
  });
});

describe("invite acceptance and password recovery isolation", () => {
  test("accepts an invite, assigns the password and reloads authorization", async () => {
    const user = userEvent.setup();
    render(<AcceptInvite />);
    expect(await screen.findByText("قبول دعوة المعلم")).toBeInTheDocument();
    expect(screen.getByText("مدرسة الاختبار")).toBeInTheDocument();
    expect(screen.getByText(teacher.fullName)).toBeInTheDocument();
    const passwordFields = screen.getAllByLabelText(/كلمة المرور/);
    await user.type(passwordFields[0], "StrongPass123");
    await user.type(passwordFields[1], "StrongPass123");
    await user.click(screen.getByRole("button", { name: "حفظ كلمة المرور والدخول" }));
    await waitFor(() =>
      expect(mocks.auth.updateUser).toHaveBeenCalledWith({ password: "StrongPass123" })
    );
    expect(mocks.accepted).toHaveBeenCalledTimes(1);
    expect(mocks.auth.reloadAuthorization).toHaveBeenCalledTimes(1);
    expect(mocks.clearInviteSession).toHaveBeenCalledTimes(1);
    expect(mocks.location).toHaveBeenCalledWith("/post-login");
  });

  test("keeps invite acceptance available while authorization is still pending", async () => {
    resetAuth({
      profile: null,
      membership: null,
      school: null,
      roles: [],
      activeRoleCodes: [],
      authorizationError: "لا توجد مدرسة نشطة مرتبطة بهذا الحساب.",
      isSchoolAdmin: false,
    });
    render(<AcceptInvite />);
    expect(await screen.findByText("قبول دعوة المعلم")).toBeInTheDocument();
    expect(mocks.context).toHaveBeenCalledTimes(1);
    expect(screen.getByText("مدرسة الاختبار")).toBeInTheDocument();
  });

  test("does not show a password form without a valid invite session", async () => {
    mocks.inviteSession = false;
    render(<AcceptInvite />);
    expect(await screen.findByText("رابط الدعوة غير صالح")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "حفظ كلمة المرور والدخول" })).not.toBeInTheDocument();
  });

  test("does not show a password form without an authenticated session", async () => {
    resetAuth({ session: null });
    render(<AcceptInvite />);
    expect(await screen.findByText("رابط الدعوة غير صالح")).toBeInTheDocument();
    expect(mocks.context).not.toHaveBeenCalled();
  });

  test("keeps reset password gated by PASSWORD_RECOVERY", async () => {
    resetAuth({ isPasswordRecovery: false });
    const first = render(<ResetPassword />);
    expect(await screen.findByText("رابط الاستعادة غير صالح أو انتهت صلاحيته.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "حفظ كلمة المرور" })).not.toBeInTheDocument();
    first.unmount();

    resetAuth({ isPasswordRecovery: true });
    render(<ResetPassword />);
    expect(await screen.findByRole("button", { name: "حفظ كلمة المرور" })).toBeInTheDocument();
  });
});


describe("post-authentication route selection", () => {
  test("routes a teacher to attendance after invite acceptance", async () => {
    resetAuth({
      activeRoleCodes: ["teacher"],
      roles: [{ id: "role-teacher", code: "teacher" }],
      isSchoolAdmin: false,
    });

    render(<PostLoginRedirect />);

    await waitFor(() => expect(mocks.location).toHaveBeenCalledWith("/attendance"));
  });

  test("sends successful password login through post-login route selection", async () => {
    const user = userEvent.setup();
    const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
    resetAuth({ signInWithPassword });

    render(<Login />);

    await user.type(screen.getByPlaceholderText("admin@school.com"), "teacher@example.test");
    await user.type(screen.getByPlaceholderText("••••••••"), "StrongPass123");
    await user.click(screen.getByRole("button", { name: "تسجيل الدخول" }));

    await waitFor(() =>
      expect(signInWithPassword).toHaveBeenCalledWith(
        "teacher@example.test",
        "StrongPass123"
      )
    );
    expect(mocks.location).toHaveBeenCalledWith("/post-login");
  });

  test("routes a finance user to finance after login", async () => {
    resetAuth({
      activeRoleCodes: ["finance_officer"],
      roles: [{ id: "role-finance", code: "finance_officer" }],
      isSchoolAdmin: false,
    });

    render(<PostLoginRedirect />);

    await waitFor(() => expect(mocks.location).toHaveBeenCalledWith("/finance"));
  });

  test("routes a school admin to the dashboard after login", async () => {
    resetAuth({
      activeRoleCodes: ["school_admin"],
      roles: [{ id: "role-admin", code: "school_admin" }],
      isSchoolAdmin: true,
    });

    render(<PostLoginRedirect />);

    await waitFor(() => expect(mocks.location).toHaveBeenCalledWith("/dashboard"));
  });

  test("shows a safe state when no route is available", async () => {
    resetAuth({
      activeRoleCodes: ["observer"],
      roles: [{ id: "role-observer", code: "observer" }],
      isSchoolAdmin: false,
    });

    render(<PostLoginRedirect />);

    expect(await screen.findByText("لا توجد وجهة متاحة")).toBeInTheDocument();
    expect(screen.queryByText("الانتقال إلى المالية")).not.toBeInTheDocument();
    expect(mocks.location).not.toHaveBeenCalledWith("/finance");
  });

  test("offers teachers attendance instead of finance from the dashboard denial", async () => {
    const user = userEvent.setup();
    resetAuth({
      activeRoleCodes: ["teacher"],
      roles: [{ id: "role-teacher", code: "teacher" }],
      isSchoolAdmin: false,
    });

    render(
      <ProtectedRoute>
        <div>بيانات إدارية</div>
      </ProtectedRoute>
    );

    expect(await screen.findByText("تعذر فتح لوحة الإدارة")).toBeInTheDocument();
    expect(screen.queryByText("بيانات إدارية")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "الانتقال إلى المالية" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "الانتقال إلى الحضور" }));
    expect(mocks.location).toHaveBeenCalledWith("/attendance");
  });
});
