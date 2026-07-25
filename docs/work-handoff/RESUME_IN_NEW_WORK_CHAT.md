لدينا مشروع قائم اسمه نظام المدارس القرآنية. اقرأ ملفات الاستئناف الموجودة في `docs/work-handoff/`، ثم تحقّق من أحدث حالة GitHub قبل التنفيذ.

المستودع هو `Hassandz-bit/quran-school-platform`، والفرع الافتراضي `main`.
أحدث SHA مؤكد على `main` هو
`b78990c47b4255647aa2662e3d6d91439c9bc615`. آخر PR مدمج هو #20، وMerge
SHA هو `b78990c47b4255647aa2662e3d6d91439c9bc615`.

تم إنجاز ودمج المصادقة، المدارس والفروع والعضويات والصلاحيات، الطلاب والحلقات،
المعلمين وتعيينات الحلقات، والوحدة المالية كاملة. تم فحص migrations 001–012
وتأكد عدم وجود جداول أو صلاحيات حضور أو متابعة حفظ سابقة.

العمل الجاري هو Draft PR #21:
https://github.com/Hassandz-bit/quran-school-platform/pull/21 على الفرع
`agent/attendance-database-013` من Base SHA المذكور. كان Head SHA عند فتح PR
هو `039dc453020fc4875993db52649db907b80c5b11`، ويجب قراءة Head الحالي حيًا
من PR بعد تحديثات التوثيق. أُنشئت Migration مقترحة باسم
`supabase/013_attendance_module.sql` مع اختبار
`tests/attendance-database.test.mjs`. تحتوي على جلسات حضور وسجلات حالات الطالب
وسجل تدقيق append-only وصلاحيتي `attendance.view` و`attendance.manage` وRLS
للمدرسة والفرع والحلقة. المعلم لا يصل إلا إلى حلقة ذات تعيين نشط عندما يكون
`teachers.profile_id = auth.uid()`.

المطبّق وفق الحالة المؤكدة للمشروع هو migrations 001–012. Migration 013 غير
مطبقة. لم يُشغّل SQL في عمل الحضور، ولم يُدمج PR الحضور، ولم تبدأ واجهة
`/attendance` ولا مراحل الحفظ والتقارير.

المهمة التالية: راجع Draft PR #21 وMigration 013 وسياسات RLS. لا تكرر إنشاء
Migration أو فرع أو PR. بعد مراجعة بشرية ودمج PR وتطبيق Migration يدويًا،
تحقق حيًا من ذلك قبل إنشاء Draft PR مستقل لواجهة `/attendance`.

القيود الأمنية: لا `service_role`، لا وصول `anon`، لا حذف مباشر، لا
`select("*")`، لا تعديل migrations السابقة، لا بيانات إنتاج حساسة، ولا تجاوز
RLS. راجع خصوصًا شرط ربط `teachers.profile_id` ومنح `academic_supervisor`
للإدارة قبل التطبيق.

افحص أحدث `main` وجميع Pull Requests ذات الصلة قبل أي تعديل. لا تكرر الأعمال
المنجزة. لا تدمج أي PR ولا تشغّل SQL على Supabase إلا إذا سمحت المهمة الجديدة
بذلك صراحة. ابدأ مباشرة دون طلب تأكيد إضافي.
