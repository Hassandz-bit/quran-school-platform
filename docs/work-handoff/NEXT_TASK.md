# المهمة التالية

راجع Draft PR #24 على الرأس الحي:

https://github.com/Hassandz-bit/quran-school-platform/pull/24

أصلح داخل `supabase/014_memorization_module.sql` تحقق نطاق الآيات بحيث لا يكفي الحد العام 1–286، بل يجب أن تكون `ayah_start` و`ayah_end` ضمن عدد آيات السورة المحددة فعليًا. أضف اختبارات تمنع مثلًا الآية 8 في سورة الفاتحة وتقبل الآية 7، وتقبل الآية 286 في سورة البقرة.

بعد الإصلاح شغّل مجموعة المشروع الكاملة وTypeScript والبناء و`git diff --check`، وتأكد من Vercel. أبقِ PR #24 Draft ولا تدمجه، ولا تطبق Migration 014 ولا تشغّل SQL على Supabase. لا تبدأ واجهة متابعة الحفظ قبل دمج Migration 014 وتطبيقها والتحقق منها.
