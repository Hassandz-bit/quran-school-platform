import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const BLOCKERS = [
  "demo_cleanup_blocked_student_photo",
  "demo_cleanup_blocked_student_documents",
  "demo_cleanup_blocked_student_import_history",
  "demo_cleanup_blocked_real_school_track_result",
  "demo_cleanup_blocked_real_follow_up_note",
  "demo_cleanup_blocked_demo_teacher_payroll",
];

const UI_ERRORS = [
  "تعذر مسح العرض لأن الطالب التجريبي لديه صورة شخصية. أزل الصورة أو احفظها خارج المنصة ثم أعد المحاولة.",
  "تعذر مسح العرض لأن طالبًا تجريبيًا لديه وثائق مرفقة. انقل الوثائق أو احذفها أولًا؛ لم تُحذف.",
  "تعذر مسح العرض لأن سجل استيراد يحتفظ بمرجع إلى طالب تجريبي. راجع سجل الاستيراد أولًا.",
  "تعذر مسح العرض لأن نتيجة مسار مدرسي لطالب حقيقي مرتبطة بحلقة تجريبية. صحح ربط النتيجة أولًا.",
  "تعذر مسح العرض لأن ملاحظة متابعة لطالب حقيقي مرتبطة بحلقة أو معلم تجريبي. انقلها أو صحح الربط أولًا.",
  "تعذر مسح العرض لأن المعلم التجريبي مرتبط ببيانات موظف أو رواتب. عالج ارتباطات الرواتب أولًا.",
  "تعذر مسح العرض لوجود سجل مرتبط غير معروف؛ لم يُحذف شيء. أرسل رمز الخطأ إلى مسؤول الدعم.",
  "إجراء إنهاء العرض غير متاح في قاعدة البيانات بعد. طبّق تحديثات قاعدة البيانات ثم أعد المحاولة.",
];

const WARNING_STRINGS = [
  "استخدم البيانات التجريبية للاستكشاف فقط. عند إنهاء العرض تُحذف سجلاته المرتبطة، بما فيها الحضور والحفظ وملاحظات المتابعة ونتائج المسار المدرسي والإشعارات والعمليات المالية. لا تربطها بطلاب حقيقيين أو حسابات ودعوات حقيقية؛ وتتوقف العملية إذا وجدت صورًا أو وثائق أو سجلات استيراد أو رواتب يجب حفظها.",
  "للتأكيد اضغط الزر مرة ثانية. سيحذف النظام كيانات العرض والسجلات التابعة لها، ويوقف العملية إذا اكتشف طالبًا أو ولي أمر أو دعوة حقيقية مرتبطة، أو مرفقات أو رواتب أو سجل استيراد يجب حفظه.",
];

test("demo cleanup covers dependent modules while failing closed on real or sensitive records", async () => {
  const [sql, dataLayer, card] = await Promise.all([
    read("supabase/071_demo_cleanup_related_records.sql"),
    read("client/src/lib/demo-mode.ts"),
    read("client/src/components/DemoModeCard.tsx"),
  ]);

  assert.match(sql, /rename to clear_school_demo_data_before_071/);
  assert.match(sql, /revoke all on function public\.clear_school_demo_data_before_071\(uuid\)[\s\S]*from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.clear_school_demo_data\(uuid\) to authenticated/);
  assert.match(sql, /to_regclass\('public\.school_track_results'\)/);
  for (const blocker of BLOCKERS) assert.ok(sql.includes(blocker), `missing SQL blocker: ${blocker}`);

  const deletionOrder = [
    "delete from public.guardian_notification_events",
    "delete from public.school_track_result_history",
    "delete from public.school_track_results",
    "delete from public.memorization_follow_up_note_history",
    "delete from public.memorization_follow_up_notes",
    "delete from public.official_receipts",
    "update public.student_import_rows",
    "return public.clear_school_demo_data_before_071(target_school_id)",
  ].map(marker => sql.indexOf(marker));
  assert.ok(deletionOrder.every(position => position >= 0));
  assert.deepEqual(deletionOrder, [...deletionOrder].sort((left, right) => left - right));
  assert.match(sql, /when foreign_key_violation then[\s\S]*blocked_constraint = constraint_name[\s\S]*message = 'demo_cleanup_blocked_related_record'/i);
  assert.doesNotMatch(sql, /delete from public\.(document_records|payroll_entries|payroll_compensation_profiles|employees)/i);

  for (const blocker of [...BLOCKERS, "demo_cleanup_blocked_related_record"]) {
    assert.ok(dataLayer.includes(blocker), `missing client error mapping: ${blocker}`);
  }
  assert.match(dataLayer, /safe\?\.code === "PGRST202"/);
  assert.match(card, /نتائج المسار المدرسي/);
  assert.match(card, /تتوقف العملية/);
});

test("demo cleanup warnings and mapped errors have English catalog entries", async () => {
  const [dataLayer, card, catalog] = await Promise.all([
    read("client/src/lib/demo-mode.ts"),
    read("client/src/components/DemoModeCard.tsx"),
    read("client/src/lib/ui-copy-en.ts"),
  ]);

  for (const value of UI_ERRORS) {
    assert.ok(dataLayer.includes(value), `missing error mapping: ${value}`);
    assert.ok(catalog.includes(`"${value}":`), `missing English catalog entry: ${value}`);
  }
  for (const value of WARNING_STRINGS) {
    assert.ok(card.includes(value), `missing Demo warning: ${value}`);
    assert.ok(catalog.includes(`"${value}":`), `missing English catalog entry: ${value}`);
  }
});
