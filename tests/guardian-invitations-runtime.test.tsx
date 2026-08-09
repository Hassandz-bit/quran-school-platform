import React from "react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { INVITATION_ID, mocks } = vi.hoisted(() => {
  const invitationId = "66666666-6666-4666-8666-666666666666";

  return {
    INVITATION_ID: invitationId,
    mocks: {
      auth: {} as Record<string, unknown>,
      context: vi.fn(),
      activate: vi.fn(),
      inviteSession: invitationId as string | null,
      clearSession: vi.fn(),
      location: vi.fn(),
    },
  };
});

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return { ...actual, useLocation: () => ["/accept-guardian-invite", mocks.location] };
});

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/invite-session", () => ({
  getGuardianInviteSession: () => mocks.inviteSession,
  clearGuardianInviteSession: () => mocks.clearSession(),
}));
vi.mock("@/lib/guardian-invitations", () => ({
  fetchMyGuardianInvitationContext: (...args: unknown[]) => mocks.context(...args),
  activateGuardianInvitation: (...args: unknown[]) => mocks.activate(...args),
}));

import AcceptGuardianInvite from "@/pages/AcceptGuardianInvite";

function resetAuth(overrides: Record<string, unknown> = {}) {
  mocks.auth = {
    session: { user: { id: "33333333-3333-4333-8333-333333333333" } },
    loading: false,
    updateUser: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAuth();
  mocks.inviteSession = INVITATION_ID;
  mocks.context.mockResolvedValue({
    invitationId: INVITATION_ID,
    status: "sent",
    requiresPasswordSetup: true,
    expiresAt: "2026-08-15T00:00:00.000Z",
  });
  mocks.activate.mockResolvedValue(true);
});

describe("guardian invitation acceptance", () => {
  test("new Auth user sets a password and activates exactly once", async () => {
    const user = userEvent.setup();
    render(<AcceptGuardianInvite />);
    expect(await screen.findByText("تفعيل حساب ولي الأمر")).toBeInTheDocument();
    const fields = screen.getAllByLabelText(/كلمة المرور/);
    await user.type(fields[0], "StrongPass123");
    await user.type(fields[1], "StrongPass123");
    await user.click(
      screen.getByRole("button", { name: "حفظ كلمة المرور وتفعيل الوصول" })
    );
    await waitFor(() =>
      expect(mocks.auth.updateUser).toHaveBeenCalledWith({ password: "StrongPass123" })
    );
    expect(mocks.activate).toHaveBeenCalledWith(INVITATION_ID);
    expect(await screen.findByText("تم تفعيل وصول ولي الأمر بنجاح")).toBeInTheDocument();
    expect(mocks.clearSession).toHaveBeenCalledTimes(1);
  });

  test("existing Auth user activates without a password change", async () => {
    mocks.context.mockResolvedValue({
      invitationId: INVITATION_ID,
      status: "sent",
      requiresPasswordSetup: false,
      expiresAt: "2026-08-15T00:00:00.000Z",
    });
    render(<AcceptGuardianInvite />);
    expect(await screen.findByText("تم تفعيل وصول ولي الأمر بنجاح")).toBeInTheDocument();
    expect(mocks.auth.updateUser).not.toHaveBeenCalled();
    expect(mocks.activate).toHaveBeenCalledWith(INVITATION_ID);
    expect(screen.queryByLabelText(/كلمة المرور/)).not.toBeInTheDocument();
  });

  test("accepted retry is idempotent and creates no second activation call", async () => {
    mocks.context.mockResolvedValue({
      invitationId: INVITATION_ID,
      status: "accepted",
      requiresPasswordSetup: false,
      expiresAt: "2026-08-15T00:00:00.000Z",
    });
    render(<AcceptGuardianInvite />);
    expect(await screen.findByText("تم تفعيل وصول ولي الأمر بنجاح")).toBeInTheDocument();
    expect(mocks.activate).not.toHaveBeenCalled();
    expect(mocks.clearSession).toHaveBeenCalledTimes(1);
  });

  test("missing session or wrong user context never shows a password form", async () => {
    mocks.inviteSession = null;
    const first = render(<AcceptGuardianInvite />);
    expect(await screen.findByText("رابط الدعوة غير صالح")).toBeInTheDocument();
    expect(screen.queryByLabelText(/كلمة المرور/)).not.toBeInTheDocument();
    first.unmount();

    mocks.inviteSession = INVITATION_ID;
    mocks.context.mockResolvedValue(null);
    render(<AcceptGuardianInvite />);
    expect(await screen.findByText("رابط الدعوة غير صالح")).toBeInTheDocument();
    expect(screen.queryByLabelText(/كلمة المرور/)).not.toBeInTheDocument();
  });

  test("revoked, expired or failed activation shows only a safe retry state", async () => {
    mocks.context.mockResolvedValue({
      invitationId: INVITATION_ID,
      status: "sent",
      requiresPasswordSetup: false,
      expiresAt: "2026-08-15T00:00:00.000Z",
    });
    mocks.activate.mockResolvedValue(false);
    render(<AcceptGuardianInvite />);
    expect(await screen.findByText("تعذر إكمال التفعيل")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeInTheDocument();
    expect(screen.queryByText(/طالب|حضور|حفظ|مالية/)).not.toBeInTheDocument();
  });
});
