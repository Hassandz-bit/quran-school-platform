# المهمة التالية

لا تطبق أي Migration قديمة ولا تعِد نشر Functions لمجرد الاستئناف.

المرحلة الحالية: **FINAL LAUNCH HARDENING / pre-launch controlled validation**.

الحالة المرجعية عند Day 4: PR #56 مدمج، `main` عند `bfe2e9f9d7b6febac88ebd71a76cd6ead613e3fd`، Production حتى Migration 022، Launch Readiness أخضر، Vercel ناجح، ولا يوجد Launch Blocker مثبت في الفحص الحالي.

الترتيب التالي:

1. عند أي استئناف، تحقق أولًا من `main` الفعلي وLaunch Readiness وVercel بدل الاعتماد على هذه اللقطة.
2. راجع Vercel Production/Preview environment variables وSupabase Auth Site URL / Redirect allowlist تشغيليًا قبل قرار الإطلاق.
3. نفذ controlled E2E فقط بحسابات مصرح بها إذا كان يلزم لقرار الإطلاق؛ لا تعدل بيانات Production غير المخصصة للاختبار.
4. Guardian fresh-invite E2E وDual staff+guardian E2E لا ينفذان إلا بحساب/طالب اختبار واضح، ولا تُنشأ هوية Production عشوائية لمجرد smoke.
5. اختبر Password Recovery من رابط بريد فعلي لحساب اختبار مصرح به إذا لم يكن موثقًا نهائيًا.
6. قرر Supabase Leaked Password Protection بصورة متعمدة بعد مراجعة أثره.
7. فعّل GitHub branch protection/ruleset وrequired checks قبل توسيع العمل متعدد الوكلاء/المطورين.
8. اتخذ launch/no-launch decision منفصلًا.
9. بعد ذلك فقط ابدأ UI polish وGoogle OAuth والـroadmap المؤجل في PRs مستقلة.

اقرأ أولًا:

`docs/work-handoff/LAUNCH_HANDOFF_2026-08-10.md`
