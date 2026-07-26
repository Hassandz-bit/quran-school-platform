# 04 — واجهة الحضور

## الحالة الحية

- المستودع: `Hassandz-bit/quran-school-platform`.
- Draft PR: #22 — https://github.com/Hassandz-bit/quran-school-platform/pull/22.
- الفرع: `agent/attendance-interface`.
- Base SHA: `efe6cd55b12cc2c7c172a27d0acee5e6669866cb`.
- Head SHA للتنفيذ المختبر عند فتح PR: `697ef72ca52c3169c62b6c5969ba5ed88b813329`.
- الحالة: مفتوح، Draft، قابل للدمج، وغير مدمج.
- Vercel Preview: Ready — https://quran-school-platform-git-cc96b6-wadaker1437-gmailcoms-projects.vercel.app.
- Migration 013 مطبقة باسم `20260725005235 — 013_attendance_module`.
- لا توجد Migration جديدة في PR #22.

## الهدف المنجز

إنشاء واجهة عربية RTL وهاتف أولًا على `/attendance` تفصل العرض عن الإدارة، وتقرأ وتكتب الأعمدة اللازمة فقط ضمن المدرسة والفرع والحلقة، مع بقاء RLS المرجع النهائي.

## الحماية والصلاحيات

- `AttendanceRoute` يتطلب جلسة ومدرسة نشطة.
- `attendance.view` يتيح العرض والتصفية والملخصات فقط.
- `attendance.manage` يتيح إنشاء الجلسة وتسجيل/تعديل الحالات والحفظ الجماعي.
- `academic_supervisor` للعرض فقط ولا يرى أدوات الكتابة.
- دالة الحفظ تعيد فحص `attendance.manage` قبل أي كتابة.
- نطاق الفرع يتحقق عبر `has_school_permission` و`has_branch_permission`.
- نطاق الحلقة يتحقق عبر `can_access_attendance_class`.
- لا تُجلب أسماء الفروع والحلقات إلا بعد فحص النطاق.
- لا تُجلب بيانات الطالب إلا بعد فحص الحلقة، وبالأعمدة `id, first_name, last_name`.
- RLS وTriggers Migration 013 تتحقق مرة أخرى من المدرسة والفرع والحلقة والطالب وهوية المستخدم.

## الوظائف المنفذة

- اختيار التاريخ والفرع والحلقة ضمن النطاق.
- تحميل الطلاب النشطين من الحلقة المحددة فقط.
- حاضر، غائب، متأخر، وغياب مبرر.
- وقت الوصول عند التأخر وملاحظة حتى 500 حرف.
- تعيين الجميع حاضرًا ثم تعديل الحالات الفردية.
- ملخص فوري للحالات الأربع.
- تحميل الجلسة والسجلات السابقة للتاريخ والحلقة نفسيهما.
- إنشاء الجلسة عند أول حفظ والتعافي من تعارض التفرد `23505`.
- إدخال جماعي للسجلات الجديدة وتحديث الأعمدة المسموح بها للسجلات الموجودة.
- إعادة التحقق من الطلاب النشطين قبل الكتابة.
- حالات التحميل والخطأ والفراغ والمنع ونجاح الحفظ.
- لا حذف مباشر.

## الملفات المتغيرة

- `client/src/App.tsx`.
- `client/src/components/AttendanceRoute.tsx`.
- `client/src/lib/attendance.ts`.
- `client/src/pages/Attendance.tsx`.
- `client/src/pages/Dashboard.tsx`.
- `tests/attendance-interface.test.mjs`.
- `docs/work-handoff/01_ATTENDANCE_DISCOVERY.md`.
- `docs/work-handoff/02_ATTENDANCE_DATABASE_DESIGN.md`.
- `docs/work-handoff/03_ATTENDANCE_MIGRATION_PR.md`.
- `docs/work-handoff/04_ATTENDANCE_INTERFACE.md`.
- `docs/work-handoff/CHANGELOG_WORK.md`.
- `docs/work-handoff/CURRENT_PROJECT_STATE.md`.
- `docs/work-handoff/NEXT_TASK.md`.
- `docs/work-handoff/RESUME_IN_NEW_WORK_CHAT.md`.

## نتائج الاختبارات

- `pnpm test`: 135/135 ناجحة.
- اختبارات واجهة الحضور: 20/20 ناجحة.
- اختبارات قاعدة الحضور: 12/12 ناجحة.
- `pnpm check`: ناجح.
- `pnpm build`: ناجح.
- `git diff --check`: ناجح.
- chunk مستقل للواجهة: `22.12 kB`، gzip `7.20 kB`.
- Vercel Preview: Success/Ready.
- التثبيت المجمّد نجح باستخدام pnpm 10.4.1 مع `--ignore-workspace --frozen-lockfile --offline`؛ الصيغة الحرفية تتوقف لأن `pnpm-workspace.yaml` الحالي لا يحتوي `packages`.

## التحقق الحي من Supabase

- Migration 013 مسجلة مرة واحدة ولم تُعد.
- جداول الحضور الثلاثة موجودة وRLS مفعّل.
- لا وصول لـ`anon` ولا DELETE.
- منح INSERT/UPDATE لـ`authenticated` مقيدة بالأعمدة اللازمة فقط.
- `academic_supervisor` يملك `attendance.view` فقط.
- دوال `security definer` تضبط `search_path = ''`، ودوال الـtrigger غير قابلة للتنفيذ من المتصفح.
- عزل المدرسة والفرع والحلقة ومنع التكرار مثبتان بالسياسات والقيود.

## الأنماط المحظورة

- لا `select("*")`.
- لا `service_role`.
- لا مفاتيح ثابتة.
- لا `.delete()`.
- لا Migration جديدة.
- لا بيانات طلاب حقيقية.

## المتبقي

- مراجعة Draft PR #22 فقط على الرأس الحي.
- إبقاء PR Draft وعدم دمجه.
- لا تكرر التنفيذ أو تطبيق Migration 013.
