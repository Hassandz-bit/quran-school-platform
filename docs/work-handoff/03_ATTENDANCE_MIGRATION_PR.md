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
- سياسات SELECT/INSERT للجلسات، وسياسات SELECT/INSERT/UPDATE للسجلات.
- سياسة SELECT فقط لسجل التدقيق.
- لا سياسات أو منح DELETE.

## الصلاحيات

- `attendance.view`.
- `attendance.manage`.

## الاختبارات

- `pnpm install --frozen-lockfile`: ناجح مع pnpm 10.4.1 ومخزن مؤقت في
  `/tmp` بسبب منع الكتابة إلى `/root/.local`.
- سياسة Work تجاهلت postinstall لـ`esbuild`، لكن `vite build` نجح.
- `pnpm test`: 115/115 ناجحة، ومنها 12 اختبارًا للحضور.
- `pnpm check`: ناجح.
- `pnpm build`: ناجح.
- `git diff --check`: ناجح.
- التثبيت النهائي استخدم pnpm 10.4.1 وlockfile مجمّدًا، مع
  `--ignore-workspace` لأن ملف `pnpm-workspace.yaml` الحالي لا يحتوي
  `packages`، ودون تعديل الملف.

## حالة PR

- الرقم: #21.
- الرابط: https://github.com/Hassandz-bit/quran-school-platform/pull/21
- الفرع: `agent/attendance-database-013`.
- Base SHA: `b78990c47b4255647aa2662e3d6d91439c9bc615`.
- Head SHA عند الفتح: `039dc453020fc4875993db52649db907b80c5b11`.
- Head SHA المؤكد قبل تعديل قرار المشرف:
  `e51f2d67f5e4963f37290cfe968878791c623489`.
- Head الحي بعد تحديث هذا الملف يُقرأ من PR #21، لأن تضمين SHA الـcommit
  الجاري داخل الملف يغيّر SHA نفسه.
- Draft: نعم.
- الدمج: لم يتم.
- SQL: لم يُشغّل.

## ما لم يُنفذ

- لم تُطبق Migration على Supabase.
- لم تُنشأ واجهة.
- لم تبدأ Migration الحفظ.

## نتائج المراجعة الأمنية

- ربط `teachers.profile_id` شرط لازم لوصول المعلم.
- `academic_supervisor` يحصل على `attendance.view` فقط، ولا يحصل على
  `attendance.manage`.
- سياسات INSERT وUPDATE تتطلب `attendance.manage` ولا تقبل العرض وحده.
- عزل المدرسة والفرع والحلقة قائم عبر دالة التفويض والـFKs المركبة.
- دوال `security definer` تضبط `search_path = ''`، وتنفيذ `anon` مسحوب.
- لا توجد سياسة أو منحة DELETE.

## الخطوة التالية الدقيقة

إكمال الفحوص الخمسة والتحقق من Vercel، ثم تحويل PR #21 إلى Ready ودمجه
Squash باستخدام Head SHA المتوقع، وبعده تطبيق Migration 013 رسميًا مرة واحدة.
