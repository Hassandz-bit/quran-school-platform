# حالة المشروع الحالية

## الحالة المرجعية

- المستودع: `Hassandz-bit/quran-school-platform`.
- أحدث `main` قبل المهمة: `bdce2eebf758992aa043bd6411205fd5458a3d20`، وهو Squash Merge SHA الخاص بـPR #32.
- PR #32 مدمج، Issue #31 مغلق، وVercel ناجح على Base SHA.
- القبول التشغيلي للحفظ مكتمل: `records = 4` و`inserts = 4` و`updates = 1`، ولم يُنشأ سجل خامس.
- migrations `001` إلى `014` مطبقة، وMigration 014 لا تُعاد.
- النسخة الاحتياطية المحمية: `backup/main-bdce2ee-after-pr32-20260728`.

## المهمة الحالية — Issue #33

- الفرع: `agent/members-directory`.
- Draft PR: #34.
- النطاق: دليل أعضاء المدرسة للعرض فقط على `/members`.
- الدخول مسموح لـ`school_admin` أو لمن يملك `members.view` و`profiles.view` معًا على مستوى المدرسة.
- القراءة تستخدم `school_memberships` و`profiles` و`membership_roles` و`roles` و`branches` فقط.
- العضويات `revoked` مستبعدة، وكل استعلام tenant-owned مقيد بـ`school_id` مع بقاء RLS خط الدفاع النهائي.
- الأدوار المدرسية تظهر باسم `المدرسة كاملة` عندما يكون `branch_id = null`، والأدوار الفرعية تظهر باسم الفرع.
- الواجهة تدعم عضوًا بلا أدوار، ودورًا مدرسيًا أو فرعيًا، وأكثر من دور أو أكثر من تعيين للدور نفسه.
- لا دعوات ولا إنشاء Auth users ولا تعديل Profile أو Membership أو membership_roles.

## التحقق

- أضيفت اختبارات بيانات وصلاحيات وفلاتر، واختبارات React Testing Library لمسار الحماية ولوحة التحكم والتفاعل مع الفلاتر.
- TypeScript وبناء Vite و`git diff --check` ضمن تحقق Draft PR.
- لا SQL ولا Migration 015 ولا تغيير Supabase أو بيانات الإنتاج.
- لم يُمس أي فرع تحت `backup/*`.

## المرحلة التالية بعد الدمج والقبول فقط

دعوات الموظفين وإدارة العضويات والأدوار في مهمة مستقلة؛ لا تبدأ قبل مراجعة ودمج واختبار دليل الأعضاء.
