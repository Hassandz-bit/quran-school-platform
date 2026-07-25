# سجل عمل Work

## 2026-07-25 01:20 CET — اكتشاف وتصميم قاعدة بيانات الحضور

- الفرع المخطط: `agent/attendance-database-013`.
- Base SHA: `b78990c47b4255647aa2662e3d6d91439c9bc615`.
- Head SHA عند فتح PR:
  `039dc453020fc4875993db52649db907b80c5b11`.
- PR: #21 — https://github.com/Hassandz-bit/quran-school-platform/pull/21
- الحالة: Draft، غير مدمج.
- التغييرات:
  - فحص البنية الفعلية من migrations 001–012.
  - تأكيد عدم وجود حضور أو متابعة حفظ.
  - تصميم Migration 013 للحضور وسجل التدقيق وRLS.
  - إضافة 8 اختبارات نصية.
- الاختبارات:
  - التثبيت: ناجح باستخدام pnpm 10.4.1 ومخزن مؤقت.
  - `pnpm test`: 119/119 ناجحة.
  - `pnpm check`: ناجح.
  - `pnpm build`: ناجح.
  - `git diff --check`: ناجح.
- SQL: لم يُشغّل.
- الدمج: لم يتم.

## 2026-07-25 01:26 CET — فتح Draft PR لقاعدة بيانات الحضور

- الفرع: `agent/attendance-database-013`.
- Base SHA: `b78990c47b4255647aa2662e3d6d91439c9bc615`.
- Head SHA عند فتح PR:
  `039dc453020fc4875993db52649db907b80c5b11`.
- PR: #21 — https://github.com/Hassandz-bit/quran-school-platform/pull/21
- التغييرات: Migration 013، اختبار سياسات الحضور، وتوثيق الاستئناف.
- الاختبارات: 119/119 ناجحة؛ TypeScript والبناء وفحص الفرق ناجحة.
- SQL: لم يُشغّل.
- الدمج: لم يتم؛ PR بقي Draft.

## 2026-07-25 — تشديد صلاحية المشرف الأكاديمي ومراجعة PR #21

- الفرع: `agent/attendance-database-013`.
- Base SHA: `b78990c47b4255647aa2662e3d6d91439c9bc615`.
- Head SHA قبل التعديل:
  `e51f2d67f5e4963f37290cfe968878791c623489`.
- PR: #21 — https://github.com/Hassandz-bit/quran-school-platform/pull/21
- التغييرات:
  - إزالة `attendance.manage` عن `academic_supervisor`.
  - إبقاء `attendance.view` له.
  - توسيع اختبارات الحضور من 8 إلى 12 لتغطية العرض فقط ومنع الكتابة والعزل
    ومنع `anon` وضبط `search_path`.
  - تحديث توثيق الاستئناف بالقرار الأمني المعتمد.
- الاختبارات: 115/115 ناجحة، ومنها 12/12 للحضور؛ TypeScript والبناء وفحص
  الفرق ناجحة.
- SQL: لم يُشغّل.
- الدمج: لم يتم بعد.
