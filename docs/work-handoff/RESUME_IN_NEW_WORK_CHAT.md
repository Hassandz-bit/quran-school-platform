واصل مشروع **نظام المدارس القرآنية** من الحالة الحية التالية، ولا تكرر الأعمال المنجزة.

المستودع: `Hassandz-bit/quran-school-platform`.

- أحدث `main`: `efe6cd55b12cc2c7c172a27d0acee5e6669866cb`.
- آخر PR مدمج: PR #21 — https://github.com/Hassandz-bit/quran-school-platform/pull/21.
- Head PR #21 النهائي: `4807596e802cc3948a96779f231325e7840339bc`.
- Squash Merge SHA: `efe6cd55b12cc2c7c172a27d0acee5e6669866cb`.

Migration `supabase/013_attendance_module.sql` مطبقة رسميًا مرة واحدة على مشروع Supabase `dexquxtymmoyfzehjicf`، ومسجلة باسم `20260725005235 — 013_attendance_module`. migrations 001–013 مطبقة، ولا توجد Migration حضور غير مطبقة. لا تعِد تطبيق Migration 013 ولا أي Migration سابقة.

العمل المفتوح هو Draft PR #22:
https://github.com/Hassandz-bit/quran-school-platform/pull/22

- العنوان: `feat: add permission-aware attendance interface`.
- الفرع: `agent/attendance-interface`.
- Base SHA: `efe6cd55b12cc2c7c172a27d0acee5e6669866cb`.
- Head SHA للتنفيذ المختبر عند فتح PR: `697ef72ca52c3169c62b6c5969ba5ed88b813329`.
- اقرأ Head النهائي حيًا من PR #22 لأن تحديث التوثيق اللاحق يغيّره.
- الحالة: مفتوح، Draft، قابل للدمج، وغير مدمج.
- Vercel Preview: Ready — https://quran-school-platform-git-cc96b6-wadaker1437-gmailcoms-projects.vercel.app.

الملفات المتغيرة في PR #22:

- `client/src/App.tsx`
- `client/src/components/AttendanceRoute.tsx`
- `client/src/lib/attendance.ts`
- `client/src/pages/Attendance.tsx`
- `client/src/pages/Dashboard.tsx`
- `tests/attendance-interface.test.mjs`
- `docs/work-handoff/01_ATTENDANCE_DISCOVERY.md`
- `docs/work-handoff/02_ATTENDANCE_DATABASE_DESIGN.md`
- `docs/work-handoff/03_ATTENDANCE_MIGRATION_PR.md`
- `docs/work-handoff/04_ATTENDANCE_INTERFACE.md`
- `docs/work-handoff/CHANGELOG_WORK.md`
- `docs/work-handoff/CURRENT_PROJECT_STATE.md`
- `docs/work-handoff/NEXT_TASK.md`
- `docs/work-handoff/RESUME_IN_NEW_WORK_CHAT.md`

الواجهة المنجزة على `/attendance`: اختيار التاريخ والفرع والحلقة ضمن النطاق، طلاب الحلقة فقط، الحالات الأربع، وقت التأخر، الملاحظة، تعيين الجميع حاضرًا، التعديل، الحفظ الجماعي، تحميل السجل السابق، منع التكرار، الملخصات، وحالات التحميل والخطأ والفراغ والمنع والنجاح. الواجهة عربية RTL وهاتف أولًا.

قرار الصلاحيات الملزم: `academic_supervisor` يملك `attendance.view` فقط ولا يملك `attendance.manage`. مستخدم العرض لا يرى أدوات الكتابة ولا يرسل عمليات كتابة؛ مستخدم الإدارة يكتب ضمن نطاقه، وRLS هو المرجع النهائي.

نتائج القبول: 135/135 اختبارًا ناجحًا؛ 20/20 للواجهة و12/12 لقاعدة الحضور؛ `pnpm check` والبناء و`git diff --check` ناجحة؛ chunk الواجهة 22.12 kB وgzip 7.20 kB. التثبيت المجمّد نجح باستخدام pnpm 10.4.1 مع `--ignore-workspace --frozen-lockfile --offline` لأن `pnpm-workspace.yaml` الحالي بلا `packages`.

تحقق Supabase الحي: الجداول الثلاثة موجودة وRLS مفعّل؛ سياسات SELECT/INSERT/UPDATE موجودة حسب الحاجة؛ منح الكتابة لـ`authenticated` مقيدة بالأعمدة اللازمة؛ `anon` بلا وصول؛ لا DELETE؛ دوال الأمان تضبط `search_path = ''`؛ عزل المدرسة والفرع والحلقة قائم؛ المشرف الأكاديمي للعرض فقط.

المهمة التالية فقط: راجع Draft PR #22 على الرأس الحي، وتحقق من Vercel، واتركه Draft وغير مدمج. لا تنشئ Migration جديدة ولا تطبق SQL ولا تكرر ما سبق. تحقق حيًا من GitHub وSupabase قبل أي خطوة.
