import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/084_attendance_transactional_sync.sql", import.meta.url),
  "utf8",
);
const attendance = readFileSync(
  new URL("../client/src/lib/attendance.ts", import.meta.url),
  "utf8",
);

test("attendance sync operation ledger is tenant- and actor-scoped with unique operation IDs", () => {
  assert.match(migration, /create table public\.attendance_sync_operations/i);
  assert.match(migration, /actor_profile_id uuid not null references public\.profiles/i);
  assert.match(migration, /school_id uuid not null references public\.schools/i);
  assert.match(
    migration,
    /unique \(actor_profile_id, operation_id\)/i,
  );
  assert.match(migration, /request_payload jsonb not null/i);
  assert.match(migration, /alter table public\.attendance_sync_operations enable row level security/i);
  assert.match(migration, /revoke all on public\.attendance_sync_operations from public, anon, authenticated, service_role/i);
});

test("attendance batch RPC is authenticated, permission checked, and bounded", () => {
  assert.match(migration, /create or replace function public\.save_attendance_batch/i);
  assert.match(migration, /actor_id uuid := \(select auth\.uid\(\)\)/i);
  assert.match(migration, /public\.can_access_attendance_class\([\s\S]*'attendance\.manage'/i);
  assert.match(migration, /batch_size < 1 or batch_size > 200/i);
  assert.match(migration, /jsonb_typeof\(target_rows\) is distinct from 'array'/i);
  assert.match(migration, /parsed\.status is null/i);
  assert.match(migration, /attendance\.manage/i);
  assert.match(migration, /attendance_roster_changed/i);
  assert.match(migration, /attendance_duplicate_or_invalid_student/i);
});

test("idempotent retries return the committed result and reject payload reuse", () => {
  assert.match(migration, /on conflict \(actor_profile_id, operation_id\) do nothing/i);
  assert.match(migration, /prior_operation\.request_payload is distinct from/i);
  assert.match(migration, /attendance_operation_id_reused/i);
  assert.match(
    migration,
    /if prior_operation\.session_id is not null then[\s\S]*return query select prior_operation\.session_id, prior_operation\.saved_count, true/i,
  );
});

test("attendance rows are applied in one database function transaction", () => {
  assert.match(migration, /insert into public\.attendance_sessions/i);
  assert.match(migration, /for row_item in select value from jsonb_array_elements\(target_rows\)/i);
  assert.match(migration, /expected_updated_at_value := nullif\(row_item ->> 'expected_updated_at'/i);
  assert.match(migration, /current_updated_at_value is distinct from expected_updated_at_value/i);
  assert.match(migration, /if expected_updated_at_value is null then[\s\S]*insert into public\.attendance_records/i);
  assert.match(migration, /update public\.attendance_records[\s\S]*updated_at = expected_updated_at_value/i);
  assert.match(migration, /update public\.attendance_sync_operations[\s\S]*saved_count = batch_size/i);
  assert.match(migration, /begin;[\s\S]*commit;/i);
});

test("client attendance saves use the transactional RPC and send an operation UUID", () => {
  assert.match(attendance, /client\.rpc\("save_attendance_batch"/i);
  assert.match(attendance, /crypto\.randomUUID\(\)/i);
  assert.match(attendance, /expected_updated_at: row\.baseUpdatedAt \?\? null/i);
  assert.match(attendance, /baseUpdatedAt: record\?\.updated_at \?\? null/i);
  assert.doesNotMatch(attendance, /getOrCreateAttendanceSession\(client, input\)/);
  assert.doesNotMatch(attendance, /updateExistingRecords\(client, input/);
});
