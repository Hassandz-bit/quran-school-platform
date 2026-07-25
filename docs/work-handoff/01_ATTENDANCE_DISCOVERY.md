# 01 — اكتشاف بنية الحضور والمتابعة القرآنية

## هدف المرحلة

فحص أحدث `main` وبنية قاعدة البيانات والواجهات المتعلقة بالطلاب والمعلمين
والحلقات والفروع والعضويات والصلاحيات، والتحقق من وجود جداول حضور أو حفظ سابقة.

## نقطة البداية

- المستودع: `Hassandz-bit/quran-school-platform`.
- الفرع: `main`.
- SHA المؤكد: `b78990c47b4255647aa2662e3d6d91439c9bc615`.
- آخر PR مدمج: #20.

## ما فُحص

- migrations من `001` إلى `012`.
- `schools`, `branches`, `profiles`, `school_memberships`.
- `roles`, `permissions`, `role_permissions`, `membership_roles`.
- `classes`, `students`.
- `teachers`, `class_teachers`.
- دوال التفويض:
  - `current_profile_is_active()`
  - `is_active_school_member(uuid)`
  - `has_any_active_membership()`
  - `has_school_permission(uuid, text)`
  - `has_branch_permission(uuid, uuid, text)`
- سياسات RLS ومنح الأعمدة في وحدات الطلاب والحلقات والمعلمين.
- قائمة ملفات PRs من #1 إلى #20 للتأكد من ترتيب migrations.

## ما اكتُشف فعليًا

### الطلاب والحلقات

- `classes` تحتوي:
  - `id`, `school_id`, `branch_id`, `name`, `code`, `schedule_label`,
    `status`, `created_by`, timestamps.
- القيد `classes_school_branch_id_unique (school_id, branch_id, id)` صالح
  للربط المركب مع جلسة حضور.
- `students` تحتوي:
  - `id`, `school_id`, `branch_id`, `class_id` وباقي بيانات الطالب.
- `class_id` اختياري، لكنه إذا وُجد يجب أن يكون في المدرسة والفرع نفسيهما.
- حالات الطلاب تشمل `active`, `suspended`, `transferred`, `graduated`,
  `withdrawn`.

### المعلمون والتعيينات

- `teachers` تحتوي `school_id`, `branch_id` و`profile_id` اختياريًا.
- `class_teachers` تربط المعلم بالحلقة داخل المدرسة والفرع نفسيهما.
- تعيين الحلقة له `status` بقيمتي `active` و`inactive`.
- دور `teacher` لا يحصل على `teachers.view` في Migration 006، لذلك لا يجوز
  بناء RLS الحضور على قدرة المعلم على قراءة جدول `teachers` مباشرة.

### العضويات والصلاحيات

- `membership_roles.branch_id = null` يعني نطاق المدرسة كلها.
- قيمة فرع تعني أن الدور محدود بذلك الفرع.
- `has_branch_permission` يقبل صلاحية مدرسية أو صلاحية الدور في الفرع نفسه.
- الصلاحيات الموجودة قبل المرحلة:
  - `classes.view`, `classes.manage`
  - `students.view`, `students.manage`
  - `teachers.view`, `teachers.manage`
  - صلاحيات النظام والمالية.
- لا توجد `attendance.view` أو `attendance.manage`.
- لا توجد `memorization.view` أو `memorization.manage`.

### جداول الحضور والحفظ

- لا توجد جداول أو Views أو دوال أو سياسات باسم attendance.
- لا توجد جداول أو Views أو دوال أو سياسات باسم memorization.
- الرقم التالي المتاح لـMigration هو `013`.

## القرارات وأسبابها

- إنشاء `attendance.view` و`attendance.manage` لأن البدائل الموجودة لا تحقق
  المعنى نفسه، واستخدام صلاحيات الطلاب أو الحلقات سيخلط مسؤوليات مستقلة.
- عدم إنشاء صلاحيات الحفظ الآن؛ تُضاف في Migration الحفظ المستقلة لاحقًا.
- استخدام `class_teachers` مرجعًا حصريًا لنطاق المعلم، مع ربط
  `teachers.profile_id` بحساب Auth.
- اعتماد `academic_supervisor` للعرض فقط عبر `attendance.view`، دون
  `attendance.manage`، تطبيقًا لمبدأ أقل صلاحية.
- استخدام دالة `security definer` محدودة ومقفلة أمام `anon` لحل نطاق الحلقة،
  لأن RLS جدول المعلمين الحالي لا يسمح للمعلم بقراءة سجل المعلم مباشرة.
- عدم تعديل أي Migration سابقة.

## الملفات التي أُنشئت أو عُدلت

- هذا الملف.
- `docs/work-handoff/CURRENT_PROJECT_STATE.md`.
- ملفات التصميم والـMigration المذكورة في المرحلتين التاليتين.

## الأوامر والفحوص

- التحقق الحي من المستودع وcommits وPRs عبر GitHub.
- بحث نصي في migrations عن الجداول والسياسات والصلاحيات.
- فحص أعمدة وقيود ملفات `001`, `002`, `004`, `005`, `006`, `007`–`012`.

## ما لم يُنفذ

- لم يُشغّل SQL.
- لم يحدث اتصال بقاعدة Supabase الحية.
- لم تُنشأ واجهة حضور.
- لم يبدأ تصميم الحفظ.
- لم يُدمج أي PR.

## المخاطر والنقاط التي تحتاج مراجعة

- أي معلم غير مربوط عبر `teachers.profile_id` سيُمنع من الوصول، حتى لو كان
  لديه دور `teacher`. هذا منع آمن مقصود.
- يجب عدم منح دور `teacher` وصولًا عامًا لكل حلقات الفرع.

## الخطوة التالية الدقيقة

إكمال المراجعة الأمنية والفحوص النهائية لـPR #21، ثم تحويله إلى Ready ودمجه
Squash وتطبيق Migration 013 رسميًا إذا بقي Head SHA ثابتًا ونجحت الفحوص.
