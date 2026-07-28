واصل مشروع **نظام المدارس القرآنية** من الحالة التالية دون تكرار الأعمال المنجزة.

المستودع: `Hassandz-bit/quran-school-platform`.

## الحالة الحالية

- أحدث `main`: `e4416758218ee62d4eff2c567900cdb7b7f419fc`، وهو Merge SHA الخاص بـPR #30.
- Issue #29 مغلق وPR #30 مدمج.
- Issue #31 مفتوح ومربوط بـDraft PR #32.
- الفرع: `agent/fix-memorization-runtime-update`.
- Head الوظيفي المختبر قبل تحديث التوثيق: `61a07edd756df73ecc0941e97fa9b01aa2b11ad7`.
- migrations `001` إلى `014` مطبقة، وMigration 014 مطبقة مرة واحدة فقط ولا تُعاد.

## التشخيص المثبت لـIssue #31

- Production Deployment SHA هو `e4416758218ee62d4eff2c567900cdb7b7f419fc`.
- Production alias العام: `https://quran-school-platform-livid.vercel.app`.
- Production deployment المباشر: `https://quran-school-platform-jv8l9fgub-wadaker1437-gmailcoms-projects.vercel.app`.
- Preview SHA الخاص بـPR #30: `2ed5971ff5c46a4cf291df79138655e5217a1498`.
- Preview URL: `https://quran-school-platform-igh2ft3z5-wadaker1437-gmailcoms-projects.vercel.app`.
- bundle الحفظ المنشور على النطاق العام يحتوي نصوص إصلاح PR #30.
- اختبار React Testing Library حقيقي نفّذ Edit ثم Save على سجل قائم وأثبت UPDATE واحدًا و0 INSERT وبقاء عدد السجلات واحدًا وبقاء وضع التعديل.
- effects الحالية لا تمسح `draft.recordId` أثناء مسار تعديل عادي.
- السلوك التشغيلي المسجل يطابق نسخة JavaScript قديمة بقيت محملة في تبويب مفتوح قبل نشر PR #30، وليس bundle الإنتاج الحالي.

## إصلاح Draft PR #32

- حقن معرف بناء غير حساس من أول 7 أحرف من Commit SHA في HTML وJavaScript.
- عرض معرف النسخة في رأس صفحة الحفظ.
- قبل الحفظ، تقارن الصفحة نسخة JavaScript المحملة مع نسخة HTML الحالية عبر طلب `no-store`.
- إذا كان التبويب قديمًا، يُمنع الحفظ قبل استدعاء طبقة البيانات وتظهر رسالة تطلب إعادة التحميل.
- لا يتغير RLS ولا Supabase ولا طبقة حفظ السجلات.

## التحقق

- جميع اختبارات Node: `198/198` ناجحة.
- اختبار واجهة الحفظ: `27/27` ناجحًا.
- اختبار قاعدة الحفظ: `14/14` ناجحًا.
- اختبارات Runtime الجديدة: `3/3` ناجحة.
- TypeScript: ناجح.
- بناء Vite: ناجح.
- `git diff --check`: ناجح.
- Vercel: Success على Head الوظيفي.

## الأمان والقيود

- لا `.delete()` ولا زر حذف.
- لا `service_role` ولا `SUPABASE_SERVICE`.
- لم يُشغّل SQL تغييري أو Migration.
- لم تتغير Supabase أو بيانات الإنتاج.
- لم تُحذف أو تُعدّل سجلات الاختبار الأربعة ولم يُنشأ سجل خامس.
- لم تُعد Migration 014.
- لم يُمس `backup/main-e441675-after-pr30-20260728` أو أي فرع `backup/*`.

## المهمة التالية فقط

بعد مراجعة ودمج Draft PR #32، اختبر UPDATE حقيقيًا من صفحة محملة حديثًا، وتحقق من بقاء عدد السجلات أربعة وظهور حركة `update` في سجل التدقيق. لا تبدأ وحدة جديدة.
