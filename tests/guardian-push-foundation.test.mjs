import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("guardian push subscriptions stay closed to direct browser table access", async () => {
  const migration = await read("supabase/023_guardian_push_foundation.sql");

  assert.match(migration, /alter table public\.guardian_push_subscriptions enable row level security/i);
  assert.match(
    migration,
    /revoke all on public\.guardian_push_subscriptions\s+from public, anon, authenticated/i
  );
  assert.doesNotMatch(
    migration,
    /grant\s+(select|insert|update|delete)[\s\S]*guardian_push_subscriptions[\s\S]*authenticated/i
  );
  assert.match(migration, /constraint guardian_push_subscriptions_endpoint_unique\s+unique \(endpoint\)/i);
});

test("registration RPC is authenticated, guardian-scoped, and transfers a shared endpoint safely", async () => {
  const migration = await read("supabase/023_guardian_push_foundation.sql");

  assert.match(migration, /create or replace function public\.register_my_guardian_push_subscription/i);
  assert.match(migration, /current_user_id uuid := \(select auth\.uid\(\)\)/i);
  assert.match(migration, /relationship\.guardian_profile_id = current_user_id/i);
  assert.match(migration, /relationship\.status = 'active'/i);
  assert.match(migration, /on conflict \(endpoint\) do update/i);
  assert.match(migration, /guardian_profile_id = excluded\.guardian_profile_id/i);
  assert.match(
    migration,
    /grant execute on function public\.register_my_guardian_push_subscription\(text, text, text, text\)\s+to authenticated/i
  );
  assert.match(
    migration,
    /revoke execute on function public\.register_my_guardian_push_subscription\(text, text, text, text\)\s+from anon/i
  );
});

test("guardian push permission is requested only from the explicit enable function", async () => {
  const helper = await read("client/src/lib/guardian-push.ts");
  const parentHome = await read("client/src/pages/ParentHome.tsx");

  assert.match(helper, /export async function enableGuardianPush/);
  assert.match(helper, /Notification\.requestPermission\(\)/);
  assert.match(helper, /pushManager\.subscribe\(\{/);
  assert.match(helper, /userVisibleOnly: true/);
  assert.match(helper, /register_my_guardian_push_subscription/);
  assert.doesNotMatch(helper, /from\("guardian_push_subscriptions"\)/);
  assert.match(parentHome, /onClick=\{\(\) => void handleEnablePush\(\)\}/);
  assert.match(parentHome, /تفعيل تنبيهات الغياب/);
});

test("service worker displays bounded push content and only opens parent routes", async () => {
  const worker = await read("client/public/sw.js");

  assert.match(worker, /self\.addEventListener\("push"/);
  assert.match(worker, /self\.registration\.showNotification/);
  assert.match(worker, /self\.addEventListener\("notificationclick"/);
  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.match(worker, /!url\.pathname\.startsWith\("\/parent"\)/);
  assert.match(worker, /return "\/parent"/);
  assert.match(worker, /boundedPushText/);
});
