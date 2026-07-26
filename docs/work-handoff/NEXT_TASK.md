# المهمة التالية

راجع Draft PR #24 على الرأس الحي:

https://github.com/Hassandz-bit/quran-school-platform/pull/24

## الحالة

- Migration المقترحة: `supabase/014_memorization_module.sql`.
- تم إصلاح حدود الآيات حسب العدد الفعلي لكل سورة.
- اختبارات Migration 014: 14/14 ناجحة محليًا.
- Vercel: Success.
- Migration 014 لم تُطبق، ولم يُشغّل SQL بسببها.

## المطلوب في Work باستخدام الرصيد اليومي

1. افحص أحدث Head لـPR #24 ولا تعد كتابة العمل المنجز.
2. شغّل:
   - `pnpm test`
   - `pnpm check`
   - `pnpm build`
   - `git diff --check`
3. راجع SQL أمنيًا، خصوصًا RLS ودوال `SECURITY DEFINER` ومنح الأعمدة وعدم وجود DELETE أو وصول `anon`.
4. تحقق أن دالة `quran_surah_ayah_count` تحتوي 114 قيمة وأن القيد يستخدمها لـ`ayah_start` و`ayah_end`.
5. تحقق أن المعلم لا ينشئ سجلًا باسم معلم آخر ولا يعدّل سجل معلم آخر.
6. أبقِ PR #24 Draft ولا تدمجه ولا تطبق Migration 014.
7. أعد تقريرًا بالرأس النهائي، عدد الاختبارات، الملفات، Vercel، وأي مانع حقيقي.

لا تبدأ واجهة متابعة الحفظ قبل دمج Migration 014 وتطبيقها والتحقق منها.
