# سجل عمل Work

## 2026-07-25 — وحدة الحضور

- PR #21 أضاف قاعدة الحضور وMigration 013.
- القرار الأمني: `academic_supervisor` يملك `attendance.view` فقط.
- PR #21 دُمج Squash عند `efe6cd55b12cc2c7c172a27d0acee5e6669866cb`.
- Migration 013 طُبقت مرة واحدة ومسجلة باسم `20260725005235 — 013_attendance_module`.
- PR #22 أضاف واجهة `/attendance` ودُمج Squash عند `157aea41f4fbc4de652a311e8637e84a149e64d8`.

## 2026-07-26 — قاعدة متابعة الحفظ

- PR #24 أضاف `memorization_records` و`memorization_record_history` والصلاحيات وRLS.
- أضيفت `quran_surah_ayah_count(smallint)` بأعداد آيات السور الـ114.
- الاختبارات النهائية: 157/157، ومنها 14/14 لـMigration 014.
- PR #24 دُمج Squash عند `5ef52977d3ad858107415ee95005aa3781d13248`.
- Migration 014 طُبقت مرة واحدة ومسجلة باسم `20260726143930 — 014_memorization_module`.

## 2026-07-26 إلى 2026-07-27 — واجهة متابعة الحفظ

- PR #26 أضاف المسار `/memorization` وواجهة الحفظ والمراجعة وسجل الطالب والتدقيق.
- عولج نطاق مدير المدرسة ومدير الفرع وحساب المعلم، وثُبّت معلم السجل أثناء التعديل.
- نتائج القبول: 181/181 للمشروع، 24/24 لواجهة الحفظ، و14/14 لقاعدة الحفظ.
- PR #26 دُمج Squash عند `8b35634a5a61370a1268c7a9173d414f5cdd616f`، وVercel Success.
- لم يُشغّل SQL، ولم تتغير Supabase، ولم تُعد Migration 014.

## 2026-07-27 — النسخ الاحتياطية والتوثيق

- حُفظت نسخ ثابتة تحت `backup/*`، وممنوع تعديلها أو حذفها أو الدمج منها.
- حُدثت ملفات الاستئناف لتشير إلى حالة الدمج الفعلية.

## 2026-07-27 إلى 2026-07-28 — إدارة ربط قوائم الحلقات

- PR #28 أضاف ربط الطالب بحلقة نشطة من فرعه وإدارة `class_teachers` بدوري `primary` و`assistant`.
- الصلاحيات الفعلية: `students.manage` و`teachers.manage`.
- المجموعة الكاملة `195/195` ناجحة، وTypeScript والبناء و`git diff --check` ناجحة.
- PR #28 دُمج Squash عند `acd61bdf79ebc196e35d736f1a786a1c7aae5e39`، وVercel Success.
- لم يُشغّل SQL، ولم تتغير Supabase أو بيانات الإنتاج، ولم تُعد Migration 014.

## 2026-07-28 — إصلاح Issue #29

- كان `handleSave` يعيد النموذج إلى `createMemorizationDraft` بعد الحفظ ويمسح `recordId`، فيؤدي الحفظ التالي إلى INSERT.
- PR #30 أبقى `result.recordId` والقيم المحفوظة، وأضاف شارة وضع التعديل وزر `سجل جديد` الصريح.
- المجموعة الكاملة `198/198`، واختبار الواجهة `27/27`، وقاعدة الحفظ `14/14` ناجحة.
- PR #30 دُمج Squash عند `e4416758218ee62d4eff2c567900cdb7b7f419fc`، وIssue #29 أُغلق.
- لم يُشغّل SQL، ولم تتغير Supabase أو migrations، ولم تُعد Migration 014.

## 2026-07-28 — تشخيص وإصلاح Issue #31

- أظهر الاختبار التشغيلي أربعة سجلات وأربع حركات `insert` و0 حركات `update` بعد دمج PR #30.
- فُحص GitHub Deployments وVercel: Merge SHA `e4416758218ee62d4eff2c567900cdb7b7f419fc` مصنف Production، وPR #30 Head `2ed5971ff5c46a4cf291df79138655e5217a1498` مصنف Preview.
- Production alias العام هو `https://quran-school-platform-livid.vercel.app`، والنشر المباشر محمي بـVercel SSO.
- فحص chunk `Memorization-BeCn5N9o.js` على النطاق العام أثبت وجود جميع نصوص إصلاح PR #30.
- اختبار React Testing Library حقيقي على كود Merge SHA نفذ Edit→Save وأثبت UPDATE واحدًا و0 INSERT وعدم زيادة عدد السجلات وبقاء `recordId`.
- ثبت أن Runtime الحالي لا يمسح `draft.recordId`؛ السلوك التشغيلي يطابق JavaScript قديمًا بقي محملًا في تبويب مفتوح قبل النشر.
- أُنشئ Draft PR #32 على الفرع `agent/fix-memorization-runtime-update`.
- أضيف معرف بناء من Commit SHA في HTML وJavaScript، وحارس يقارن النسخة قبل الحفظ ويمنع أي تبويب قديم من الكتابة حتى إعادة التحميل.
- أضيف اختبار تفاعل دائم واختباران لحارس النسخة؛ اختبارات Runtime `3/3` ناجحة.
- جميع اختبارات Node `198/198`، وواجهة الحفظ `27/27`، وقاعدة الحفظ `14/14`، وTypeScript والبناء و`git diff --check` ناجحة.
- Head الوظيفي المختبر: `61a07edd756df73ecc0941e97fa9b01aa2b11ad7`، وVercel عليه Success.
- لم يُشغّل SQL تغييري، ولم تتغير Supabase، ولم تُحذف أو تُعدّل السجلات الأربعة، ولم يُنشأ سجل خامس، ولم يُمس أي فرع `backup/*`.
- المهمة التالية بعد دمج PR #32: UPDATE حقيقي من صفحة محملة حديثًا والتحقق من حركة تدقيق `update` مع بقاء عدد السجلات أربعة.
