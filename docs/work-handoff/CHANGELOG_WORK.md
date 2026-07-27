# سجل عمل Work

## 2026-07-25 — وحدة الحضور

- PR #21 أضاف قاعدة الحضور وMigration 013.
- القرار الأمني: `academic_supervisor` يملك `attendance.view` فقط.
- PR #21 دُمج Squash عند `efe6cd55b12cc2c7c172a27d0acee5e6669866cb`.
- Migration 013 طُبقت مرة واحدة ومسجلة باسم `20260725005235 — 013_attendance_module`.
- PR #22 أضاف واجهة `/attendance` ودُمج Squash عند `157aea41f4fbc4de652a311e8637e84a149e64d8`.

## 2026-07-26 — قاعدة متابعة الحفظ

- PR #24 أضاف `memorization_records` و`memorization_record_history` والصلاحيات وRLS.
- أضيفت `quran_surah_ayah_count(smallint)` بأعداد آيات السور الـ114.
- الاختبارات النهائية: 157/157، ومنها 14/14 لـMigration 014.
- PR #24 دُمج Squash عند `5ef52977d3ad858107415ee95005aa3781d13248`.
- Migration 014 طُبقت مرة واحدة ومسجلة باسم `20260726143930 — 014_memorization_module`.
- التحقق: جدولان مع RLS، 4 سياسات، 13 فهرسًا، 20 قيدًا، و0 بيانات تشغيلية.

## 2026-07-26 — Draft PR #26 لواجهة متابعة الحفظ

- PR: https://github.com/Hassandz-bit/quran-school-platform/pull/26
- الفرع: `agent/memorization-interface`.
- Base SHA: `206505f0fe5c1658afd9c3aa63d4d0cfcef1e4ea`.
- Head التنفيذي عند فتح PR: `03cfe247e1b6d9d61db2d5c15f265a3dd3aa8c02`.
- أضيف المسار `/memorization` والحماية وطبقة البيانات والصفحة والربط بلوحة التحكم.
- أضيفت السور الـ114 وحدود الآيات وأنواع الحفظ والمراجعة والتقييم والأخطاء والملاحظات والواجب.
- أضيف إنشاء السجل وتعديله وسجل الطالب وسجل التدقيق.
- فُصل العرض عن الإدارة، وقُيد المعلم بهويته وتعييناته.
- أضيف `tests/memorization-interface.test.mjs`.
- Vercel على الرأس التنفيذي: Success.
- PR بقي Draft ولم يُشغّل SQL ولم تتغير Supabase.

## المتبقي

- فحص Head الحي لـPR #26 في Work.
- تشغيل جميع الاختبارات وTypeScript والبناء و`git diff --check`.
- عدم الدمج أو تشغيل SQL قبل اعتماد التقرير النهائي.