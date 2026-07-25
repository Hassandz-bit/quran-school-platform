# المهمة التالية

- الهدف: مراجعة Draft PR #21 وMigration الحضور أمنيًا، ثم انتظار الدمج
  والتطبيق اليدوي قبل بدء واجهة الحضور.
- نقطة البداية الصحيحة: PR
  https://github.com/Hassandz-bit/quran-school-platform/pull/21
- أحدث `main` المؤكد:
  `b78990c47b4255647aa2662e3d6d91439c9bc615`.
- الفرع: `agent/attendance-database-013`.
- الملفات المطلوب مراجعتها:
  - `supabase/013_attendance_module.sql`
  - `tests/attendance-database.test.mjs`
  - `docs/work-handoff/`
- القيود:
  - لا تدمج PR تلقائيًا.
  - لا تشغّل SQL دون إذن صريح.
  - لا تعدّل migrations 001–012.
  - لا تبدأ `/attendance` قبل تأكيد دمج PR #21 وتطبيق Migration 013.
- شروط التوقف:
  - عدم اعتماد ربط `teachers.profile_id`.
  - تغيير قرار صلاحية `academic_supervisor`.
  - تعارض أو فشل RLS أو الاختبارات.
- اختبارات أي تعديل على PR:
  - `pnpm install --frozen-lockfile`
  - `pnpm test`
  - `pnpm check`
  - `pnpm build`
  - `git diff --check`
