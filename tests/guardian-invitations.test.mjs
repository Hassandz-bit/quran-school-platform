import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const [
  migration,
  config,
  edgeLogic,
  edgeHandler,
  edgeServices,
  acceptPage,
  inviteSession,
  app,
  packageJson,
] = await Promise.all([
  read("supabase/018_guardian_invitations.sql"),
  read("supabase/config.toml"),
  read("supabase/functions/invite-guardian/logic.ts"),
  read("supabase/functions/invite-guardian/handler.ts"),
  read("supabase/functions/invite-guardian/services.ts"),
  read("client/src/pages/AcceptGuardianInvite.tsx"),
  read("client/src/lib/invite-session.ts"),
  read("client/src/App.tsx"),
  read("package.json"),
]);

const tableDefinition =
  migration.match(/create table public\.guardian_invitations \([\s\S]*?\n\);/)?.[0] ?? "";

test("Migration 018 creates only the guardian invitation lifecycle", () => {
  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
  assert.match(migration, /create table public\.guardian_invitations/);
  assert.equal((migration.match(/create table public\./g) ?? []).length, 1);
  assert.doesNotMatch(migration, /create table public\.guardian_channel_preferences/);
  assert.doesNotMatch(migration, /create policy[\s\S]*?on public\.(students|attendance_sessions|attendance_records|memorization_records|student_charges|payments|expenses)/i);
});

test("invitation rows use exact tenant-safe relationship identity", () => {
  assert.match(
    tableDefinition,
    /foreign key \([\s\S]*?school_id,[\s\S]*?student_id,[\s\S]*?student_guardian_id,[\s\S]*?guardian_profile_id[\s\S]*?\)[\s\S]*?references public\.student_guardians/i
  );
  assert.match(
    migration,
    /guardian_invitations_live_relationship_unique_idx[\s\S]*?where status in \('prepared', 'sent'\)/
  );
  assert.match(
    migration,
    /guardian_invitations_school_idempotency_unique_idx[\s\S]*?school_id, idempotency_key_hash/
  );
});

test("tokens, passwords and raw idempotency keys are never persisted", () => {
  for (const forbidden of [
    "password text",
    "raw_invite_token",
    "access_token",
    "refresh_token",
    "confirmation_token",
    "otp text",
    "service_role_key",
  ]) {
    assert.equal(tableDefinition.toLowerCase().includes(forbidden), false);
  }
  assert.match(tableDefinition, /idempotency_key_hash text not null/);
  assert.match(tableDefinition, /request_payload_hash text not null/);
  assert.match(tableDefinition, /target_email = lower\(btrim\(target_email\)\)/);
});

test("RLS denies direct browser access and sensitive RPCs are hardened", () => {
  assert.match(migration, /alter table public\.guardian_invitations enable row level security/);
  assert.match(migration, /revoke all on public\.guardian_invitations[\s\S]*?from public, anon, authenticated/);
  assert.doesNotMatch(migration, /grant (select|insert|update|delete)[\s\S]*?guardian_invitations to authenticated/i);
  for (const functionName of [
    "get_guardian_invitation_retry",
    "prepare_guardian_invitation",
    "claim_guardian_invitation_delivery",
    "fail_guardian_invitation_delivery",
    "get_my_guardian_invitation",
    "activate_guardian_invitation",
    "revoke_live_guardian_invitations",
  ]) {
    assert.match(
      migration,
      new RegExp(
        "create or replace function public\\." + functionName +
          "[\\s\\S]*?security definer[\\s\\S]*?set search_path = ''"
      )
    );
  }
  assert.match(
    migration,
    /revoke all on function public\.claim_guardian_invitation_delivery\(uuid\)[\s\S]*?from public, anon, authenticated/
  );
});

test("idempotency is payload-bound, concurrency-safe and delivery is claimed once", () => {
  assert.match(edgeHandler, /Idempotency-Key/);
  assert.match(edgeLogic, /\{16,128\}/);
  assert.match(edgeLogic, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /idempotency payload mismatch/);
  assert.match(migration, /for update/);
  assert.match(edgeHandler, /findRetry/);
  assert.match(edgeHandler, /claimDelivery/);
  assert.match(edgeHandler, /if \(!claim\.deliveryClaimed\)/);
});

test("activation is bound to auth.uid and changes relationship, invite and audit atomically", () => {
  const activation = migration.slice(
    migration.indexOf("create or replace function public.activate_guardian_invitation"),
    migration.indexOf("create or replace function public.revoke_live_guardian_invitations")
  );
  assert.match(activation, /current_user_id uuid := \(select auth\.uid\(\)\)/);
  assert.match(activation, /guardian_profile_id <> current_user_id/);
  assert.match(activation, /for update/);
  assert.match(activation, /relationship_record\.status <> 'pending'/);
  assert.match(activation, /student_status in \('transferred', 'graduated', 'withdrawn'\)/);
  assert.match(activation, /set status = 'active',[\s\S]*?activated_at = activation_time/);
  assert.match(activation, /set status = 'accepted',[\s\S]*?accepted_at = activation_time/);
  assert.match(activation, /'relationship_activated'/);
  assert.match(activation, /invitation_record\.status = 'accepted'[\s\S]*?return true/);
  assert.match(migration, /guardian_access_events_relationship_activation_unique_idx/);
});

test("relationship revocation immediately invalidates every live invitation", () => {
  const revocation = migration.slice(
    migration.indexOf("create or replace function public.revoke_live_guardian_invitations"),
    migration.indexOf("create trigger student_guardians_revoke_live_invitations")
  );
  assert.match(revocation, /new\.status = 'revoked'/);
  assert.match(revocation, /status = 'revoked'/);
  assert.match(revocation, /invitation\.status in \('prepared', 'sent'\)/);
  assert.match(migration, /after update of status on public\.student_guardians/);
});

test("the Edge Function keeps account operations server-side and responses generic", () => {
  assert.match(config, /\[functions\.invite-guardian\][\s\S]*?verify_jwt = true/);
  assert.match(edgeServices, /auth\.admin\.listUsers/);
  assert.match(edgeServices, /auth\.admin\.createUser/);
  assert.match(edgeServices, /shouldCreateUser: false/);
  assert.match(edgeServices, /prepare_student_guardian_link/);
  assert.match(edgeServices, /prepare_guardian_invitation/);
  const successResponse = edgeLogic.slice(
    edgeLogic.indexOf("export function safeSuccessResponse"),
    edgeLogic.length
  );
  assert.doesNotMatch(
    successResponse,
    /accountExists|requiresPasswordSetup|guardianProfileId|email/
  );
  assert.doesNotMatch(edgeHandler, /school_memberships|membership_roles|guardian role/);
});

test("the trusted redirect and minimal acceptance route do not build Parent Portal", () => {
  assert.match(edgeLogic, /new URL\("\/accept-guardian-invite", parsed\.origin\)/);
  assert.match(inviteSession, /captureGuardianInviteSession/);
  assert.match(app, /path="\/accept-guardian-invite"/);
  assert.match(acceptPage, /activateGuardianInvitation/);
  assert.match(acceptPage, /requiresPasswordSetup/);
  assert.match(acceptPage, /تم تفعيل وصول ولي الأمر بنجاح/);
  assert.doesNotMatch(acceptPage, /ParentShell|ParentRoute|\/parent|attendance|memorization|finance/i);
});

test("no guardian membership, role or permission is provisioned", () => {
  for (const content of [migration, edgeHandler, edgeServices]) {
    assert.doesNotMatch(content, /insert into public\.school_memberships/i);
    assert.doesNotMatch(content, /insert into public\.membership_roles/i);
    assert.doesNotMatch(content, /grant[\s\S]*?(students\.view|attendance\.view|memorization\.view|finance\.view)/i);
  }
});

test("package scripts register isolated Migration 018 and Deno validation", () => {
  const scripts = JSON.parse(packageJson).scripts;
  assert.equal(
    scripts["test:guardian-invitations:migration"],
    "bash tests/run-guardian-invitations-migration-test.sh"
  );
  assert.match(
    scripts["test:guardian-invitations:function"],
    /invite-guardian\/index\.test\.ts/
  );
  assert.match(scripts["test:runtime"], /guardian-invitations-runtime\.test\.tsx/);
});
