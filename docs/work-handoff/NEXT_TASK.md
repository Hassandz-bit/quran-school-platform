# المهمة التالية

- الهدف: إكمال تحقق Migration الحضور وفتح Draft PR مستقل ثم التوقف.
- نقطة البداية: `main` عند
  `b78990c47b4255647aa2662e3d6d91439c9bc615`.
- الفرع: `agent/attendance-database-013`.
- الملفات المطلوب مراجعتها:
  - `supabase/013_attendance_module.sql`
  - `tests/attendance-database.test.mjs`
  - `docs/work-handoff/`
- القيود:
  - لا دمج.
  - لا SQL على Supabase.
  - لا تعديل migrations 001–012.
  - لا واجهة حضور قبل دمج Migration 013 وتطبيقها.
- شروط التوقف:
  - فشل اختبار وظيفي أو أمني.
  - تعارض أحدث `main`.
  - قرار حول ربط `teachers.profile_id` أو صلاحيات المشرف الأكاديمي.
- الاختبارات المطلوبة:
  - `pnpm install --frozen-lockfile`
  - `pnpm test`
  - `pnpm check`
  - `pnpm build`
  - `git diff --check`
