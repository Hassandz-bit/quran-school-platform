# المهمة التالية

افحص Draft PR #26 على الرأس الحي:

https://github.com/Hassandz-bit/quran-school-platform/pull/26

## الحالة

- الفرع: `agent/memorization-interface`.
- Base SHA: `206505f0fe5c1658afd9c3aa63d4d0cfcef1e4ea`.
- Head التنفيذي عند فتح PR: `03cfe247e1b6d9d61db2d5c15f265a3dd3aa8c02`.
- اقرأ Head الحي لأن commits التوثيق اللاحقة تغيّره.
- Vercel على الرأس التنفيذي: Success.
- PR Draft وغير مدمج.
- Migration 014 مطبقة سابقًا؛ لا تعِد تطبيقها.
- لا توجد Migration جديدة ولم يُشغّل SQL في PR #26.

## المطلوب في Work

1. اجلب فرع PR #26 الحقيقي وتحقق من `git rev-parse HEAD`.
2. شغّل جميع اختبارات المشروع.
3. شغّل `tests/memorization-interface.test.mjs` منفردًا.
4. شغّل TypeScript والبناء و`git diff --check`.
5. راجع أن مستخدم `memorization.view` لا يرى ولا يرسل عمليات كتابة.
6. راجع تقييد الفروع والحلقات والطلاب والمعلمين المعيّنين.
7. تحقق من السور الـ114 وحدود الآيات والتقييم والأخطاء وحدود النصوص.
8. تحقق من إنشاء السجل وتعديله وسجل الطالب وسجل التدقيق.
9. تأكد من عدم وجود `select("*")` أو `service_role` أو `.delete()`.
10. تحقق من Vercel على Head نفسه.
11. لا تدمج PR ولا تشغّل SQL ولا تنشئ Migration جديدة.

أعد تقريرًا مختصرًا بالرأس الفعلي، عدد الاختبارات، TypeScript، البناء، `git diff --check`، Vercel، وأي مانع حقيقي.