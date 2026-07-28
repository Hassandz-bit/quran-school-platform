const INVITE_SESSION_KEY = "qsp_teacher_invite_session";

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
