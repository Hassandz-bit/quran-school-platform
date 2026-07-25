# المهمة التالية

- الهدف: إكمال فحوص PR #21 بعد اعتماد عرض المشرف الأكاديمي فقط، والتحقق من
  Vercel وHead SHA، ثم تحويله إلى Ready ودمجه Squash وتطبيق Migration 013
  رسميًا مرة واحدة.
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
  - لا تدمج إلا باستخدام Head SHA المتوقع وبعد نجاح جميع الفحوص.
  - لا تطبق Migration قبل الدمج، ولا تستخدم SQL يدويًا بدل آلية migration.
  - لا تعدّل migrations 001–012.
  - لا تبدأ `/attendance` قبل تأكيد دمج PR #21 وتطبيق Migration 013.
  - `academic_supervisor` للعرض فقط.
- شروط التوقف:
  - عدم اعتماد ربط `teachers.profile_id`.
  - تعارض أو فشل RLS أو الاختبارات.
  - تغير Head SHA بعد المراجعة أو فشل Vercel.
- اختبارات أي تعديل على PR:
  - `pnpm install --frozen-lockfile`
  - `pnpm test`
  - `pnpm check`
  - `pnpm build`
  - `git diff --check`
