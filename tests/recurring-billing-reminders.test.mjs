import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const [migration, fix, client, launcher, navigation] = await Promise.all([
  read("supabase/045_recurring_billing_and_finance_reminders.sql"),
  read("supabase/046_recurring_billing_discount_scope_fix.sql"),
  read("client/src/lib/recurring-billing.ts"),
  read("client/src/components/RecurringBillingLauncher.tsx"),
  read("client/src/components/FinanceNavigation.tsx"),
]);

const sql = migration + "\n" + fix;

test("adds auditable idempotent recurring charge generation", () => {
  assert.match(migration, /generation_source text not null default 'manual'/);
  assert.match(migration, /billing_cycle_snapshot text/);
  assert.match(migration, /fee_plan_name_snapshot text/);
  assert.match(migration, /student_charges_recurring_period_unique_idx/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /on conflict do nothing/);
  assert.match(migration, /where not exists \([\s\S]*existing\.fee_plan_id = plan_row\.id/);
});

test("supports monthly quarterly yearly periods and requires due_day", () => {
  assert.match(migration, /target_billing_cycle not in \('monthly', 'quarterly', 'yearly'\)/);
  assert.match(migration, /date_trunc\('month'/);
  assert.match(migration, /date_trunc\('quarter'/);
  assert.match(migration, /date_trunc\('year'/);
  assert.match(sql, /FINANCE_RECURRING_DUE_DAY_REQUIRED/);
  assert.match(sql, /resolved_due_date := resolved_period_start \+ \(plan_row\.due_day - 1\)/);
});

test("keeps discount application explicit instead of guessing a policy", () => {
  assert.match(fix, /d\.start_date <= resolved_period_end/);
  assert.match(fix, /d\.end_date is null or d\.end_date >= resolved_period_start/);
  assert.match(sql, /students_with_active_discounts/);
  assert.match(sql, /'discount_policy', 'explicit_review_required'/);
  assert.match(migration, /plan_row\.amount,\s*0,\s*null,\s*null,\s*null,/);
  assert.doesNotMatch(sql, /discount_amount\s*=\s*d\.value|apply.*discount.*autom/i);
  assert.match(launcher, /لن يطبّق النظام أي خصم تلقائيًا/);
});

test("reuses exact finance.manage school and branch scopes", () => {
  assert.match(migration, /has_school_permission\(target_school_id, 'finance\.manage'\)/);
  assert.match(migration, /has_branch_permission\([\s\S]*'finance\.manage'/);
  assert.match(migration, /FINANCE_SCHOOL_MANAGE_REQUIRED/);
  assert.doesNotMatch(sql, /role\.code\s*=\s*'school_admin'|finance_officer.*bypass/i);
});

test("reuses the existing notification center with distinct retry-safe stages", () => {
  assert.match(migration, /create_app_notification_internal/);
  assert.match(migration, /'finance_charge_due_soon'/);
  assert.match(migration, /'finance_charge_overdue'/);
  assert.match(migration, /'finance',\s*reminder_event_type/);
  assert.match(migration, /c\.status in \('pending', 'partially_paid'\)/);
  assert.match(migration, /r\.status = 'active'/);
  assert.match(migration, /gp\.status = 'active'/);
  assert.match(migration, /outstanding > 0/);
  assert.doesNotMatch(migration, /insert into public\.app_notifications/i);
});

test("keeps browser mutations RPC-only", () => {
  assert.match(client, /rpc\(\s*"generate_recurring_fee_plan_charges"/);
  assert.match(client, /rpc\("queue_finance_charge_reminders"/);
  assert.doesNotMatch(client + launcher, /\.from\("student_charges"\)/);
  assert.doesNotMatch(client + launcher, /\.from\("app_notifications"\)/);
  assert.doesNotMatch(client + launcher, /service_role/i);
});

test("requires preview before each explicit confirm action", () => {
  assert.match(launcher, /معاينة التوليد/);
  assert.match(launcher, /تأكيد إنشاء \{generationPreview\.toCreateCount\} استحقاقًا/);
  assert.match(launcher, /معاينة التذكيرات/);
  assert.match(launcher, /تأكيد إرسال \{reminderPreview\.totalNewNotifications\} تذكيرًا/);
  assert.match(launcher, /لا تُنشأ رسوم ولا إشعارات بمجرد فتح هذه النافذة/);
});

test("integrates the launcher only on finance charges for finance managers", () => {
  assert.match(navigation, /currentPath === "\/finance\/charges"/);
  assert.match(navigation, /access\.canManageFinance/);
  assert.match(navigation, /RecurringBillingLauncher schoolId=\{school\.id\}/);
});
