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
`teachers.profile_id = auth.uid()`. القرار الأمني المعتمد هو أن
`academic_supervisor` يملك `attendance.view` فقط ولا يملك
`attendance.manage`.

المطبّق وفق الحالة المؤكدة للمشروع هو migrations 001–012. Migration 013 غير
مطبقة. لم يُشغّل SQL في عمل الحضور، ولم يُدمج PR الحضور، ولم تبدأ واجهة
`/attendance` ولا مراحل الحفظ والتقارير.

المهمة التالية: أكمل فحوص Draft PR #21 بعد تعديل صلاحية المشرف، وتحقق من
Vercel وHead SHA، ثم حوّله إلى Ready وادمجه Squash باستخدام Head المتوقع.
بعد الدمج فقط تحقق أن Migration 013 غير مسجلة، وطبّقها رسميًا مرة واحدة على
المشروع `dexquxtymmoyfzehjicf`، ثم تحقق من الجداول والقيود والمنح وRLS. بعد
نجاح ذلك أنشئ Draft PR مستقل لواجهة `/attendance` ولا تدمجه.

القيود الأمنية: لا `service_role`، لا وصول `anon`، لا حذف مباشر، لا
`select("*")`، لا تعديل migrations السابقة، لا بيانات إنتاج حساسة، ولا تجاوز
RLS. حافظ على شرط ربط `teachers.profile_id`، وعلى كون
`academic_supervisor` للعرض فقط.

افحص أحدث `main` وجميع Pull Requests ذات الصلة قبل أي تعديل. لا تكرر الأعمال
المنجزة. تحقّق حيًا من GitHub وSupabase قبل المتابعة، ولا تعد تشغيل Migration
مطبقة. لا تدمج Draft PR واجهة الحضور. ابدأ مباشرة دون طلب تأكيد إضافي.
