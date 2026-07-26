# 04 — واجهة الحضور

## الحالة الحية

- المستودع: `Hassandz-bit/quran-school-platform`.
- PR: #22 — https://github.com/Hassandz-bit/quran-school-platform/pull/22.
- الفرع المنفذ: `agent/attendance-interface`.
- Base SHA: `efe6cd55b12cc2c7c172a27d0acee5e6669866cb`.
- Head SHA النهائي: `6f590ec7e51c2183215ee9e146af3369485b1c25`.
- الحالة: مدمج بطريقة Squash.
- Squash Merge SHA: `157aea41f4fbc4de652a311e8637e84a149e64d8`.
- Vercel على Merge SHA: Success.
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
- الأدوار الحالية المخولة بالحضور تملك `students.view` ضمن نطاقها، وRLS الطلاب يبقى المرجع النهائي.
- RLS وTriggers Migration 013 تتحقق مرة أخرى من المدرسة والفرع والحلقة والطالب وهوية المستخدم.
- دالة `can_access_attendance_class` من نوع `SECURITY DEFINER` مقصودة؛ تعيد Boolean فقط، تتحقق من العضوية والنطاق، تضبط `search_path = ''`، ولا تُمنح لـ`anon`.

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

## الملفات التي دخلت عبر PR #22

- `client/src/App.tsx`.
- `client/src/components/AttendanceRoute.tsx`.
- `client/src/lib/attendance.ts`.
- `client/src/pages/Attendance.tsx`.
- `client/src/pages/Dashboard.tsx`.
- `tests/attendance-interface.test.mjs`.
- ملفات الاستئناف داخل `docs/work-handoff/`.

## نتائج الاختبارات

- `pnpm test`: 135/135 ناجحة.
- اختبارات واجهة الحضور: 20/20 ناجحة.
- اختبارات قاعدة الحضور: 12/12 ناجحة.
- `pnpm check`: ناجح.
- `pnpm build`: ناجح.
- `git diff --check`: ناجح.
- chunk مستقل للواجهة: `22.12 kB`، gzip `7.20 kB`.
- Vercel Preview وVercel بعد الدمج: Success.
- التثبيت المجمّد نجح باستخدام pnpm 10.4.1 مع `--ignore-workspace --frozen-lockfile --offline`؛ الصيغة الحرفية تتوقف لأن `pnpm-workspace.yaml` الحالي لا يحتوي `packages`.

## التحقق من Supabase

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

## الخطوة التالية

- اختبار قبول إنتاجي غير هدمي لمسار `/attendance`.
- بعد نجاحه: تصميم قاعدة بيانات متابعة الحفظ والمراجعة في Migration التالية المتاحة داخل Draft PR مستقل.
- لا تبدأ واجهة الحفظ قبل مراجعة ودمج وتطبيق Migration قاعدة الحفظ.
