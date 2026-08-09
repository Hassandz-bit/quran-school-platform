const INVITE_SESSION_KEY = "qsp_teacher_invite_session";
const GUARDIAN_INVITE_SESSION_KEY = "qsp_guardian_invite_session";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getInviteType(location: Location): string | null {
  const search = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  return search.get("type") ?? hash.get("type");
}

export function captureTeacherInviteSession(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.pathname !== "/accept-invite") return false;
  if (getInviteType(window.location) !== "invite") return false;
  window.sessionStorage.setItem(INVITE_SESSION_KEY, "active");
  return true;
}

export function hasTeacherInviteSession(): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(INVITE_SESSION_KEY) === "active";
}

export function clearTeacherInviteSession(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(INVITE_SESSION_KEY);
}

export function captureGuardianInviteSession(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.pathname !== "/accept-guardian-invite") return false;
  const invitationId = new URLSearchParams(window.location.search).get(
    "invitation"
  );
  const inviteType = getInviteType(window.location);
  if (
    !invitationId ||
    !UUID_PATTERN.test(invitationId) ||
    !inviteType ||
    !["invite", "magiclink", "signup"].includes(inviteType)
  ) {
    return false;
  }
  window.sessionStorage.setItem(GUARDIAN_INVITE_SESSION_KEY, invitationId);
  return true;
}

export function getGuardianInviteSession(): string | null {
  if (typeof window === "undefined") return null;
  const invitationId = window.sessionStorage.getItem(
    GUARDIAN_INVITE_SESSION_KEY
  );
  return invitationId && UUID_PATTERN.test(invitationId) ? invitationId : null;
}

export function clearGuardianInviteSession(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(GUARDIAN_INVITE_SESSION_KEY);
}
