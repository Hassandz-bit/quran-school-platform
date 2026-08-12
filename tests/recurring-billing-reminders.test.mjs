import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const [migration, fix, client, launcher, discountClient, discountLauncher, navigation] = await Promise.all([
  read("supabase/045_recurring_billing_and_finance_reminders.sql"),
  read("supabase/046_recurring_billing_discount_scope_fix.sql"),
  read("client/src/lib/recurring-billing.ts"),
  read("client/src/components/RecurringBillingLauncher.tsx"),
  read("client/src/lib/student-discounts.ts"),
  read("client/src/components/StudentDiscountPolicyLauncher.tsx"),
  read("client/src/components/FinanceNavigation.tsx"),
]);

const sql = migration + "\n" + fix;

test("adds auditable idempotent recurring charge generation", () => {
  assert.match(migration, /generation_source text not null default 'manual'/);
  assert.match(migration, /billing_cycle_snapshot text/);
  assert.match(migration, /fee_plan_name_snapshot text/);
  assert.match(migration, /student_charges_recurring_period_unique_idx/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(fix, /on conflict do nothing/);
  assert.match(fix, /where not exists \([\s\S]*existing\.fee_plan_id = plan_row\.id/);
});

test("supports monthly quarterly yearly periods and requires due_day", () => {
  assert.match(migration, /target_billing_cycle not in \('monthly', 'quarterly', 'yearly'\)/);
  assert.match(migration, /date_trunc\('month'/);
  assert.match(migration, /date_trunc\('quarter'/);
  assert.match(migration, /date_trunc\('year'/);
  assert.match(sql, /FINANCE_RECURRING_DUE_DAY_REQUIRED/);
  assert.match(sql, /resolved_due_date := resolved_period_start \+ \(plan_row\.due_day - 1\)/);
});

test("supports explicit social and sibling policies without silently stacking discounts", () => {
  assert.match(fix, /auto_apply_recurring boolean not null default false/);
  assert.match(fix, /discount_type in \('needy', 'sibling'\)/);
  assert.match(fix, /create_finance_student_discount_policy/);
  assert.match(fix, /FINANCE_DISCOUNT_POLICY_OVERLAP/);
  assert.match(fix, /FINANCE_DISCOUNT_POLICY_CONFLICT/);
  assert.match(fix, /auto_discount_student_count/);
  assert.match(fix, /auto_discount_savings/);
  assert.match(fix, /'discount_policy', 'auto_social_sibling_after_preview'/);
  assert.match(fix, /when 'needy' then 'خصم اجتماعي/);
  assert.match(fix, /when 'sibling' then 'خصم إخوة/);
  assert.match(launcher, /توفير الخصومات/);
  assert.match(launcher, /سيُطبّق تلقائيًا بعد التأكيد خصم اجتماعي\/إخوة/);
  assert.match(launcher, /autoDiscountConflictCount > 0/);
});

test("keeps legacy discount policies manual by default", () => {
  assert.match(fix, /default false/);
  assert.match(fix, /not d\.auto_apply_recurring/);
  assert.match(launcher, /سياسة خصم قديمة\/يدوية غير مفعلة للدوري/);
});

test("provides auditable discount policy management through RPCs", () => {
  assert.match(discountClient, /rpc\(\s*"create_finance_student_discount_policy"/);
  assert.match(discountClient, /rpc\(\s*"deactivate_finance_student_discount_policy"/);
  assert.match(discountClient, /rpc\("list_finance_student_discount_policies"/);
  assert.doesNotMatch(discountClient + discountLauncher, /\.from\("student_discounts"\)/);
  assert.match(discountLauncher, /حالة اجتماعية \/ طالب محتاج/);
  assert.match(discountLauncher, /أكثر من ابن \/ خصم إخوة/);
  assert.match(discountLauncher, /لن يُجمع خصمان تلقائيًا لنفس الفترة/);
  assert.match(discountLauncher, /الإيقاف لا يحذف السياسة/);
});

test("reuses exact finance.manage school and branch scopes", () => {
  assert.match(migration, /has_school_permission\(target_school_id, 'finance\.manage'\)/);
  assert.match(migration, /has_branch_permission\([\s\S]*'finance\.manage'/);
  assert.match(fix, /finance_can_manage_generation_scope/);
  assert.match(sql, /FINANCE_SCHOOL_MANAGE_REQUIRED/);
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

test("keeps recurring and notification browser mutations RPC-only", () => {
  assert.match(client, /rpc\(\s*"generate_recurring_fee_plan_charges"/);
  assert.match(client, /rpc\("queue_finance_charge_reminders"/);
  assert.doesNotMatch(client + launcher, /\.from\("student_charges"\)/);
  assert.doesNotMatch(client + launcher, /\.from\("app_notifications"\)/);
  assert.doesNotMatch(client + launcher + discountClient + discountLauncher, /service_role/i);
});

test("requires preview before each explicit confirm action", () => {
  assert.match(launcher, /معاينة التوليد/);
  assert.match(launcher, /تأكيد إنشاء \{generationPreview\.toCreateCount\} استحقاقًا/);
  assert.match(launcher, /معاينة التذكيرات/);
  assert.match(launcher, /تأكيد إرسال \{reminderPreview\.totalNewNotifications\} تذكيرًا/);
  assert.match(launcher, /لا تُنشأ رسوم ولا إشعارات بمجرد فتح هذه النافذة/);
});

test("integrates recurring billing and discount management only on finance charges for managers", () => {
  assert.match(navigation, /currentPath === "\/finance\/charges"/);
  assert.match(navigation, /access\.canManageFinance/);
  assert.match(navigation, /StudentDiscountPolicyLauncher schoolId=\{school\.id\}/);
  assert.match(navigation, /RecurringBillingLauncher schoolId=\{school\.id\}/);
});
