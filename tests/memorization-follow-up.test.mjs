import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [migration, data, component, page, launchReadiness, packageJson] =
  await Promise.all([
    read("supabase/040_memorization_follow_up_notes.sql"),
    read("client/src/lib/memorization-follow-up.ts"),
    read("client/src/components/MemorizationFocusNotes.tsx"),
    read("client/src/pages/Memorization.tsx"),
    read(".github/workflows/launch-readiness-validation.yml"),
    read("package.json"),
  ]);

test("creates private follow-up observations and append-only audit history", () => {
  assert.match(migration, /create table public\.memorization_follow_up_notes/i);
  assert.match(migration, /create table public\.memorization_follow_up_note_history/i);
  assert.match(
    migration,
    /create trigger memorization_follow_up_notes_audit\s+after insert or update/i
  );
  assert.match(migration, /insert into public\.memorization_follow_up_note_history/i);
  assert.doesNotMatch(migration, /for delete to authenticated/i);
  assert.doesNotMatch(migration, /grant delete/i);
});

test("uses existing exact memorization permissions instead of role shortcuts", () => {
  assert.match(
    migration,
    /public\.can_access_memorization_class\([\s\S]*?'memorization\.manage'/i
  );
  assert.match(
    migration,
    /public\.can_access_memorization_class\([\s\S]*?'memorization\.view'[\s\S]*?or public\.can_access_memorization_class\([\s\S]*?'memorization\.manage'/i
  );
  assert.match(migration, /public\.has_non_teacher_memorization_manage/i);
  assert.match(migration, /role\.code <> 'teacher'/i);
  assert.match(migration, /MEMORIZATION_FOLLOW_UP_TEACHER_IDENTITY_MISMATCH/);
  assert.doesNotMatch(component, /role\.code/);
});

test("pins security-definer search paths and keeps private helpers browser-inaccessible", () => {
  for (const name of [
    "has_non_teacher_memorization_manage",
    "prepare_memorization_follow_up_note",
    "audit_memorization_follow_up_note",
    "create_memorization_follow_up_note",
    "set_memorization_follow_up_note_status",
    "list_memorization_focus_notes",
    "list_memorization_follow_up_history",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `create or replace function public\\.${name}[\\s\\S]*?security definer\\s+set search_path = ''`,
        "i"
      )
    );
  }

  assert.match(
    migration,
    /revoke execute on function public\.has_non_teacher_memorization_manage\(uuid, uuid\)[\s\S]*from anon, authenticated/i
  );
  assert.match(
    migration,
    /revoke execute on function public\.prepare_memorization_follow_up_note\(\)[\s\S]*from anon, authenticated/i
  );
  assert.match(
    migration,
    /revoke execute on function public\.audit_memorization_follow_up_note\(\)[\s\S]*from anon, authenticated/i
  );
});

test("exposes only authenticated RPCs and no direct browser table privileges", () => {
  for (const rpc of [
    "create_memorization_follow_up_note",
    "set_memorization_follow_up_note_status",
    "list_memorization_focus_notes",
    "list_memorization_follow_up_history",
  ]) {
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${rpc}[\\s\\S]*?to authenticated`, "i")
    );
    assert.match(
      migration,
      new RegExp(`revoke execute on function public\\.${rpc}[\\s\\S]*?from anon`, "i")
    );
  }

  assert.match(
    migration,
    /revoke all on public\.memorization_follow_up_notes,[\s\S]*public\.memorization_follow_up_note_history[\s\S]*from public, anon, authenticated/i
  );
  assert.doesNotMatch(data, /\.from\("memorization_follow_up_notes"\)/);
  assert.doesNotMatch(data, /\.from\("memorization_follow_up_note_history"\)/);
  assert.match(data, /client\.rpc\("list_memorization_focus_notes"/);
  assert.match(data, /client\.rpc\([\s\S]*"list_memorization_follow_up_history"/);
  assert.match(data, /client\.rpc\("create_memorization_follow_up_note"/);
  assert.match(data, /client\.rpc\([\s\S]*"set_memorization_follow_up_note_status"/);
});

test("derives recurrence from immutable occurrences instead of a mutable counter", () => {
  assert.doesNotMatch(migration, /recurrence_count\s+integer/i);
  assert.match(
    migration,
    /count\(\*\) over \([\s\S]*?partition by[\s\S]*?note\.student_id[\s\S]*?note\.category[\s\S]*?note\.surah_number[\s\S]*?note\.ayah_start[\s\S]*?note\.ayah_end/i
  );
  assert.match(
    migration,
    /row_number\(\) over \([\s\S]*?latest_rank/i
  );
  assert.match(migration, /note\.latest_rank = 1/i);
  assert.match(migration, /note\.status in \('open', 'improved'\)/i);
  assert.match(migration, /MEMORIZATION_FOLLOW_UP_CONTENT_IMMUTABLE/);
  assert.match(migration, /current_status = target_status[\s\S]*?return true/i);
});

test("validates structured category priority Quran range and note length", () => {
  for (const category of [
    "memorization_error",
    "revision_weakness",
    "tajweed",
    "hesitation",
    "forgetting",
    "recurring_error",
    "other",
  ]) {
    assert.match(migration, new RegExp(`'${category}'`));
    assert.match(data, new RegExp(`"${category}"`));
  }
  assert.match(migration, /target_category is null/i);
  assert.match(migration, /target_priority is null or target_priority not between 1 and 3/i);
  assert.match(migration, /target_surah_number < 1[\s\S]*target_surah_number > 114/i);
  assert.match(
    migration,
    /target_ayah_end > public\.quran_surah_ayah_count\(target_surah_number::smallint\)/i
  );
  assert.match(migration, /char_length\(btrim\(target_note_text\)\) not between 1 and 1000/i);
  assert.match(data, /input\.noteText\.trim\(\)/);
  assert.match(data, /input\.ayahEnd > surah\.ayahCount/);
});

test("keeps resolution metadata server-controlled and preserves history", () => {
  assert.match(migration, /new\.status := 'open'/i);
  assert.match(migration, /new\.resolved_by := \(select auth\.uid\(\)\)/i);
  assert.match(migration, /new\.resolved_at := now\(\)/i);
  assert.match(migration, /new\.resolved_by := null/i);
  assert.match(migration, /new\.resolved_at := null/i);
  assert.match(component, /تمت المعالجة/);
  assert.match(component, /تحسّن/);
  assert.match(component, /إعادة للتركيز/);
  assert.match(component, /لا توجد عملية حذف من الواجهة/);
});

test("surfaces focus notes inside the existing memorization workspace", () => {
  assert.match(page, /MemorizationFocusNotes/);
  assert.match(page, /<MemorizationFocusNotes/);
  assert.match(component, /نقاط تحتاج تركيزًا اليوم/);
  assert.match(component, /سجل ملاحظات وأخطاء الطالب/);
  assert.match(component, /تكرر ×\{note\.recurrenceCount\}/);
  assert.match(component, /props\.canManage && props\.teachers\.length > 0/);
  assert.match(component, /showForm && props\.canManage/);
});

test("links an observation to the current memorization record only when available", () => {
  assert.match(page, /sourceRecordId=\{draft\.recordId\}/);
  assert.match(data, /target_source_record_id: input\.sourceRecordId/);
  assert.match(migration, /MEMORIZATION_FOLLOW_UP_SOURCE_RECORD_SCOPE_INVALID/);
  assert.match(
    migration,
    /source_record\.student_id = target_student_id/i
  );
});

test("adds migration 040 to the existing launch readiness runner without a new workflow", () => {
  const parsed = JSON.parse(packageJson);
  assert.equal(
    parsed.scripts["test:memorization-follow-up:migration"],
    "bash tests/run-memorization-follow-up-migration-test.sh"
  );
  assert.match(
    launchReadiness,
    /Validate memorization follow-up migration[\s\S]*pnpm test:memorization-follow-up:migration/
  );
});
