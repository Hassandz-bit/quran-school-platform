# المهمة التالية

لا تطبق أي Migration قديمة ولا تعِد نشر Functions لمجرد الاستئناف.

المرحلة الحالية: **FINAL LAUNCH HARDENING / technical GO**.

الحالة المرجعية عند Day 4: PR #56 مدمج، `main` عند `bfe2e9f9d7b6febac88ebd71a76cd6ead613e3fd`، Production حتى Migration 022، Launch Readiness أخضر، Vercel ناجح، ولا يوجد Launch Blocker مثبت في الفحص الحالي.

تحقق تشغيلي إضافي في 2026-08-10:

- Vercel Production ما يزال بلا Runtime Errors مجمعة في نافذة 24 ساعة المفحوصة.
- مسارات `/reset-password` و`/accept-invite` و`/accept-guardian-invite` تخدم نسخة Production الحالية بنجاح.
- Supabase migrations ما تزال حتى 022 فقط؛ لا توجد Migration جديدة مطلوبة.
- Supabase Organization الحالية على خطة `free`.
- Leaked Password Protection غير متاح ضمن الخطة الحالية؛ يؤجل إلى ترقية Pro مستقبلًا ولا يُعامل Launch Blocker.
- Supabase Auth URL Configuration تم التحقق منه يدويًا من لوحة Production: Site URL هو `https://quran-school-platform-livid.vercel.app`، وRedirect URLs تشمل Production `reset-password` و`accept-invite` و`accept-guardian-invite*`.
- `main` ما يزال غير محمي وبدون required status checks مفروضة؛ هذا تحسين تشغيلي قبل توسيع العمل متعدد المطورين/الوكلاء، وليس blocker مثبتًا للإطلاق الحالي.
- القرار التقني الحالي: **GO**؛ لا يوجد إصلاح كود أو Migration أو Edge Function مطلوب قبل الإطلاق بناءً على الأدلة الحالية.

الترتيب التالي:

1. عند أي استئناف، تحقق أولًا من `main` الفعلي وLaunch Readiness وVercel بدل الاعتماد على هذه اللقطة.
2. أبقِ PR #57 Draft وغير مدمج حتى يصدر أمر صريح بالدمج؛ قبل الدمج أعد فحص `main` وhead/checks وأن التغييرات Documentation-only.
3. controlled real-account E2E للـGuardian fresh invite أو dual staff+guardian أو password recovery يبقى Release-confidence check فقط، ولا يُنفذ إلا بحسابات/طلاب اختبار واضحة ومصرح بها، ولا تنشأ هوية Production عشوائية لمجرد smoke.
4. فعّل GitHub branch protection/ruleset وrequired checks عندما تسمح الخطة/الإعدادات وقبل توسيع العمل متعدد الوكلاء/المطورين.
5. بعد إغلاق handoff/merge بقرار صريح، ابدأ PWA/Mobile packaging في PR مستقل، ثم UI polish وGoogle OAuth والـroadmap المؤجل في PRs منفصلة.

اقرأ أولًا:

`docs/work-handoff/LAUNCH_HANDOFF_2026-08-10.md`
