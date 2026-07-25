# 03 — Draft PR لـMigration الحضور

## هدف المرحلة

إضافة Migration الحضور بالرقم التالي المتاح واختبارات سياساتها وتوثيقها في
Draft PR مستقل، دون دمج أو تشغيل SQL.

## نقطة البداية

- Base branch: `main`.
- Base SHA: `b78990c47b4255647aa2662e3d6d91439c9bc615`.
- الفرع المخطط: `agent/attendance-database-013`.

## الملفات

- `supabase/013_attendance_module.sql`.
- `tests/attendance-database.test.mjs`.
- `docs/work-handoff/CURRENT_PROJECT_STATE.md`.
- `docs/work-handoff/01_ATTENDANCE_DISCOVERY.md`.
- `docs/work-handoff/02_ATTENDANCE_DATABASE_DESIGN.md`.
- `docs/work-handoff/03_ATTENDANCE_MIGRATION_PR.md`.
- `docs/work-handoff/CHANGELOG_WORK.md`.
- `docs/work-handoff/NEXT_TASK.md`.
- `docs/work-handoff/RESUME_IN_NEW_WORK_CHAT.md`.

## الجداول والدوال والسياسات

- الجداول:
  - `attendance_sessions`
  - `attendance_records`
  - `attendance_record_history`
- الدوال:
  - `can_access_attendance_class`
  - `prepare_attendance_record`
  - `audit_attendance_record`
- سياسات SELECT/INSERT/UPDATE للجلسات والسجلات.
- سياسة SELECT فقط لسجل التدقيق.
- لا سياسات أو منح DELETE.

## الصلاحيات

- `attendance.view`.
- `attendance.manage`.

## الاختبارات

- `pnpm install --frozen-lockfile`: ناجح مع pnpm 10.4.1 ومخزن مؤقت في
  `/tmp` بسبب منع الكتابة إلى `/root/.local`.
- سياسة Work تجاهلت postinstall لـ`esbuild`، لكن `vite build` نجح.
- `pnpm test`: 119/119 ناجحة، ومنها 8 اختبارات جديدة للحضور.
- `pnpm check`: ناجح.
- `pnpm build`: ناجح.
- `git diff --check`: ناجح.

## حالة PR

- الرقم: #21.
- الرابط: https://github.com/Hassandz-bit/quran-school-platform/pull/21
- الفرع: `agent/attendance-database-013`.
- Base SHA: `b78990c47b4255647aa2662e3d6d91439c9bc615`.
- Head SHA عند الفتح: `039dc453020fc4875993db52649db907b80c5b11`.
- Head الحي بعد تحديث هذا الملف يُقرأ من PR #21، لأن تضمين SHA الـcommit
  الجاري داخل الملف يغيّر SHA نفسه.
- Draft: نعم.
- الدمج: لم يتم.
- SQL: لم يُشغّل.

## ما لم يُنفذ

- لم تُطبق Migration على Supabase.
- لم تُنشأ واجهة.
- لم تبدأ Migration الحفظ.

## المخاطر أو قرارات المراجعة

- ربط `teachers.profile_id` شرط لازم لوصول المعلم.
- `academic_supervisor` يحصل مبدئيًا على العرض والإدارة.
- يجب مراجعة الدالة `security definer` وسياسات RLS قبل تطبيق Migration.

## الخطوة التالية الدقيقة

مراجعة Draft PR #21، ثم دمجه وتطبيق Migration 013 يدويًا خارج هذه المهمة.
لا تبدأ واجهة الحضور قبل تأكيد الدمج والتطبيق.
