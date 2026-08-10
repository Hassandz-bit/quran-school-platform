# PWA Phase 1 — Acceptance

يعد هذا الـPR ناجحًا عندما:

1. ينجح build الحالي بالكامل دون خفض أي بوابة اختبار.
2. يحتوي Production/Preview على `/manifest.webmanifest` و`/sw.js` وPWA icons.
3. يعرض المتصفح QuranOS كتطبيق قابل للتثبيت على Android/Chromium عند استيفاء متطلبات المتصفح.
4. فتح التطبيق المثبت يبدأ من `/` بوضع `standalone`.
5. لا يعترض Service Worker أي طلب non-GET أو أي طلب cross-origin.
6. لا توجد Migration أو RLS أو Edge Function أو Production data mutation ضمن الـPR.
7. يظهر زر «تثبيت QuranOS على الهاتف» فقط بعد حدث `beforeinstallprompt` الحقيقي، ولا يعتبر مجرد Add to Home Screen نجاحًا للـPWA.

ملاحظة التحقق على Android:
- Vercel Preview في المشروع محمي بـDeployment Protection، وقد يؤدي Share Link إلى إنشاء اختصار Chrome بهوية Vercel بدل PWA الحقيقي.
- لذلك نستخدم Preview للتحقق من build/manifest/service worker فقط.
- اختبار التثبيت النهائي على Android يجرى على نطاق Production العام بعد الدمج الآمن، مع إمكانية التراجع فورًا إذا لم يظهر التثبيت الحقيقي.
