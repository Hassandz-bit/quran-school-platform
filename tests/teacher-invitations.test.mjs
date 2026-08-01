import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [migration, edgeIndex, edgeHandler, edgeServices, client, acceptPage, inviteSession, config] =
  await Promise.all([
    read("supabase/015_teacher_invitations.sql"),
    read("supabase/functions/invite-teacher/index.ts"),
    read("supabase/functions/invite-teacher/handler.ts"),
    read("supabase/functions/invite-teacher/services.ts"),
    read("client/src/lib/teacher-invitations.ts"),
    read("client/src/pages/AcceptInvite.tsx"),
    read("client/src/lib/invite-session.ts"),
    read("supabase/config.toml"),
  ]);

test("Migration 015 creates only the secure teacher invitation schema", () => {
  assert.match(migration, /create table public\.teacher_invitations/i);
  assert.match(migration, /status in \('processing', 'sent', 'accepted', 'failed'\)/i);
  assert.match(migration, /email = lower\(btrim\(email\)\)/i);
  assert.match(migration, /teacher_invitations_active_teacher_unique_idx/i);
  assert.match(migration, /teacher_invitations_active_school_email_unique_idx/i);
  assert.match(migration, /teachers_profile_unique_idx/i);
  assert.match(migration, /teachers_school_normalized_email_unique_idx/i);
  assert.doesNotMatch(migration, /create table public\.(?!teacher_invitations)/i);
});

test("Migration uses scoped FKs, RLS and read-only browser grants", () => {
  assert.match(migration, /foreign key \(school_id, branch_id, teacher_id\)[\s\S]*references public\.teachers\(school_id, branch_id, id\)/i);
  assert.match(migration, /alter table public\.teacher_invitations enable row level security/i);
  assert.match(migration, /revoke all on public\.teacher_invitations from public, anon, authenticated/i);
  assert.match(migration, /grant select on public\.teacher_invitations to authenticated/i);
  assert.doesNotMatch(migration, /grant\s+(?:insert|update|delete)[\s\S]*teacher_invitations\s+to authenticated/i);
  const policyBlock = migration.slice(
    migration.indexOf("create policy teacher_invitations_select_authorized"),
    migration.indexOf("-- Trusted atomic provisioning endpoint")
  );
  assert.match(policyBlock, /members\.manage[\s\S]*members\.assign_roles[\s\S]*teachers\.manage/i);
  assert.doesNotMatch(policyBlock, /invited_user_id|auth\.uid\(\)/i);
  assert.match(migration, /create or replace function public\.get_my_teacher_invitation\(\)/i);
  assert.doesNotMatch(migration, /auth\.role\(\)/i);
});

test("privileged provisioning is atomic, server-derived and unavailable to authenticated", () => {
  assert.match(migration, /create or replace function public\.provision_teacher_invitation/i);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(migration, /role\.code = 'teacher'/i);
  assert.match(migration, /membership_role\.branch_id is null/i);
  assert.match(migration, /count\(distinct permission\.code\) = 3/i);
  assert.match(migration, /insert into public\.profiles/i);
  assert.match(migration, /insert into public\.school_memberships/i);
  const membershipInsertBlock = migration.slice(
    migration.indexOf("insert into public.school_memberships"),
    migration.indexOf("insert into public.membership_roles")
  );
  assert.match(membershipInsertBlock, /'pending'[\s\S]*null/i);
  assert.doesNotMatch(membershipInsertBlock, /'active'[\s\S]*now\(\)/i);
  assert.match(migration, /insert into public\.membership_roles/i);
  assert.match(migration, /update public\.teachers/i);
  assert.match(migration, /status = 'sent'/i);
  assert.match(migration, /from auth\.users as auth_user[\s\S]*auth_user\.id = target_invited_user_id/i);
  assert.match(migration, /invited_auth_email <> normalized_email/i);
  assert.match(migration, /char_length\(teacher_full_name\) not between 2 and 150/i);
  assert.match(migration, /revoke all on function public\.provision_teacher_invitation[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.provision_teacher_invitation[\s\S]*to service_role/i);
  assert.doesNotMatch(migration, /target_role|target_branch|target_profile|target_full_name/i);
});

test("accepting an invite activates the pending membership atomically", () => {
  const acceptBlock = migration.slice(
    migration.indexOf("create or replace function public.accept_teacher_invitation"),
    migration.indexOf("revoke all on function public.accept_teacher_invitation")
  );
  assert.match(acceptBlock, /invitation\.status in \('sent', 'accepted'\)/i);
  assert.match(acceptBlock, /for update/i);
  assert.match(acceptBlock, /membership_record\.status <> 'pending'/i);
  assert.match(acceptBlock, /set status = 'active'[\s\S]*joined_at = accepted_at_value/i);
  assert.match(acceptBlock, /set status = 'accepted'[\s\S]*accepted_at = accepted_at_value/i);
  assert.match(acceptBlock, /invitation_record\.status = 'accepted'[\s\S]*return true/i);
});

test("invitation records never store tokens, passwords, links or internal errors", () => {
  const tableDefinition = migration.slice(
    migration.indexOf("create table public.teacher_invitations"),
    migration.indexOf("comment on table public.teacher_invitations")
  );
  for (const forbidden of ["jwt", "access_token", "refresh_token", "password", "invite_url", "secret", "error_message"]) {
    assert.equal(tableDefinition.toLowerCase().includes(forbidden), false);
  }
  assert.match(migration, /failure_code text/);
});

test("Edge Function requires JWT, exact body keys and trusted CORS", () => {
  assert.match(config, /\[functions\.invite-teacher\][\s\S]*verify_jwt = true/);
  assert.match(edgeIndex, /Deno\.serve\(handler\)/);
  assert.match(edgeHandler, /request\.method !== "POST"/);
  assert.match(edgeHandler, /MAX_BODY_BYTES = 8192/);
  assert.match(edgeHandler, /Idempotency-Key/);
  assert.match(edgeHandler, /INVITATION_PERMISSION_CODES\.map/);
  assert.match(edgeHandler, /findEligibleTeacher/);
  assert.match(edgeHandler, /buildInviteRedirect/);
  assert.doesNotMatch(edgeHandler, /Access-Control-Allow-Origin["']\s*:\s*["']\*/);
  for (const field of ["role", "roleId", "roleCode", "branchId", "profileId", "redirectTo", "permissions", "isAdmin"]) {
    assert.equal(edgeHandler.includes(`payload.${field}`), false);
  }
});

test("Admin operations exist only in the Edge Function services", () => {
  assert.match(edgeServices, /auth\.admin\.inviteUserByEmail/);
  assert.match(edgeServices, /auth\.admin\.deleteUser/);
  assert.match(edgeServices, /provision_teacher_invitation/);
  const activeInvitationBlock = edgeServices.slice(
    edgeServices.indexOf("async hasActiveInvitation"),
    edgeServices.indexOf("async isTeacherEmailUnavailable")
  );
  assert.match(activeInvitationBlock, /hasActiveInvitation\(schoolId, teacherId, email\)/);
  assert.equal((activeInvitationBlock.match(/\.eq\("school_id", schoolId\)/g) ?? []).length, 2);
  assert.match(edgeHandler, /hasActiveInvitation\(\s*payload\.schoolId,/);
  assert.match(edgeHandler, /isValidProfileFullName\(teacher\.fullName\)/);
  assert.match(edgeServices, /npm:@supabase\/supabase-js@2\.110\.7/);
  for (const forbidden of [
    "auth.admin",
    "inviteUserByEmail",
    "createUser",
    "deleteUser",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
    "service_role",
  ]) {
    assert.equal(client.includes(forbidden), false, `${forbidden} leaked into client layer`);
  }
});

test("compensation is limited to the user created by the current attempt", () => {
  assert.match(edgeHandler, /createdUserId = await dependencies\.inviteAuthUser/);
  assert.match(edgeHandler, /const userCreatedByThisAttempt = createdUserId/);
  assert.match(edgeHandler, /deleteCreatedAuthUser\(userCreatedByThisAttempt\)/);
  assert.match(edgeHandler, /authUserExists/);
  assert.doesNotMatch(edgeHandler, /deleteCreatedAuthUser\((?:callerId|payload|teacher)/);
});

test("accept invite is isolated from PASSWORD_RECOVERY", () => {
  assert.match(inviteSession, /getInviteType\(window\.location\) !== "invite"/);
  assert.match(acceptPage, /hasTeacherInviteSession/);
  assert.match(acceptPage, /updateUser\(\{ password \}\)/);
  assert.match(acceptPage, /markMyTeacherInvitationAccepted/);
  assert.match(acceptPage, /reloadAuthorization/);
  assert.doesNotMatch(acceptPage, /PASSWORD_RECOVERY|isPasswordRecovery|clearPasswordRecovery/);
});

test("Edge logs exclude credentials and email content", () => {
  const logBlock = edgeHandler.match(/dependencies\.log\(\{[\s\S]*?\}\);/)?.[0] ?? "";
  for (const forbidden of ["token", "email", "Authorization", "redirectTo", "secret", "password"]) {
    assert.equal(logBlock.includes(forbidden), false);
  }
});
