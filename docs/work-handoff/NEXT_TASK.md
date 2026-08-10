# المهمة التالية

لا تطبق أي Migration قديمة ولا تعِد نشر Functions لمجرد الاستئناف.

المرحلة الحالية: **FINAL LAUNCH HARDENING / pre-launch controlled validation**.

الحالة المرجعية عند Day 4: PR #56 مدمج، `main` عند `bfe2e9f9d7b6febac88ebd71a76cd6ead613e3fd`، Production حتى Migration 022، Launch Readiness أخضر، Vercel ناجح، ولا يوجد Launch Blocker مثبت في الفحص الحالي.

تحقق تشغيلي إضافي في 2026-08-10:

- Vercel Production ما يزال بلا Runtime Errors مجمعة في نافذة 24 ساعة المفحوصة.
- مسارات `/reset-password` و`/accept-invite` و`/accept-guardian-invite` تخدم نسخة Production الحالية بنجاح.
- Supabase migrations ما تزال حتى 022 فقط؛ لا توجد Migration جديدة مطلوبة.
- Supabase Organization الحالية على خطة `free`.
- Leaked Password Protection غير متاح ضمن الخطة الحالية؛ يؤجل إلى ترقية Pro مستقبلًا ولا يُعامل Launch Blocker.
- `main` ما يزال غير محمي وبدون required status checks مفروضة.

الترتيب التالي:

1. عند أي استئناف، تحقق أولًا من `main` الفعلي وLaunch Readiness وVercel بدل الاعتماد على هذه اللقطة.
2. راجع يدويًا Vercel Production/Preview environment variables وSupabase Auth Site URL / Redirect allowlist قبل إعلان الإطلاق؛ الموصل الحالي لا يعرض القيم السرية/إعدادات Auth الفعلية كاملة.
3. نفذ controlled E2E فقط بحسابات مصرح بها إذا كان يلزم لقرار الإطلاق؛ لا تعدل بيانات Production غير المخصصة للاختبار.
4. Guardian fresh-invite E2E وDual staff+guardian E2E لا ينفذان إلا بحساب/طالب اختبار واضح، ولا تُنشأ هوية Production عشوائية لمجرد smoke.
5. اختبر Password Recovery من رابط بريد فعلي لحساب اختبار مصرح به إذا لم يكن موثقًا نهائيًا.
6. فعّل GitHub branch protection/ruleset وrequired checks قبل توسيع العمل متعدد الوكلاء/المطورين.
7. اتخذ launch/no-launch decision منفصلًا.
8. بعد ذلك فقط ابدأ PWA/Mobile packaging وUI polish وGoogle OAuth والـroadmap المؤجل في PRs مستقلة.

اقرأ أولًا:

`docs/work-handoff/LAUNCH_HANDOFF_2026-08-10.md`
