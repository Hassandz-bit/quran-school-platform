# المهمة التالية

لا تطبق أي Migration قديمة ولا تعِد نشر Functions لمجرد الاستئناف.

المرحلة الحالية: **Pre-launch controlled validation، بدون استعجال الإطلاق**.

الترتيب المقترح:

1. تحقق من أن `main` هو الأحدث وأن Launch Readiness Validation أخضر.
2. راجع Vercel Production/Preview environment variables وSupabase Auth Site URL / Redirect allowlist.
3. نفذ controlled E2E لحساب Admin وحساب Teacher معروفين، مع تجنب تعديل بيانات Production غير الضرورية.
4. لا تنفذ Guardian E2E حقيقيًا إلا بتفويض صريح لاستخدام دعوة وحساب اختبار محددين.
5. اختبر Password Recovery من رابط بريد حقيقي لحساب اختبار مصرح به.
6. قرر تفعيل Supabase Leaked Password Protection بصورة متعمدة بعد مراجعة أثره على المستخدمين.
7. فعّل GitHub branch protection/ruleset يدويًا على `main` بحيث تمر التغييرات عبر PR وCI.
8. بعد نجاح ذلك، راجع المرئيات والموبايل ثم اتخذ قرار إطلاق منفصل.

اقرأ أولًا:

`docs/work-handoff/LAUNCH_HANDOFF_2026-08-10.md`
