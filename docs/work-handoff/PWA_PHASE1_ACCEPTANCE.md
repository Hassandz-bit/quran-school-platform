# PWA Phase 1 — Acceptance

يعد هذا الـPR ناجحًا عندما:

1. ينجح build الحالي بالكامل دون خفض أي بوابة اختبار.
2. يحتوي Production/Preview على `/manifest.webmanifest` و`/sw.js` وPWA icons.
3. يعرض المتصفح QuranOS كتطبيق قابل للتثبيت على Android/Chromium عند استيفاء متطلبات المتصفح.
4. فتح التطبيق المثبت يبدأ من `/` بوضع `standalone`.
5. لا يعترض Service Worker أي طلب non-GET أو أي طلب cross-origin.
6. لا توجد Migration أو RLS أو Edge Function أو Production data mutation ضمن الـPR.

بعد نجاح Preview، يجرى اختبار تثبيت يدوي على هاتف Android قبل الدمج.
