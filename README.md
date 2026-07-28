# منصة المدرسة القرآنية الذكية

منصة عربية RTL لإدارة مدرسة قرآنية، مبنية كتطبيق ويب React متصل بـSupabase مع عزل المدارس عبر RLS.

## التقنيات الحالية

- React 19 وVite 7 وTypeScript 5.9.
- Tailwind CSS 4 ومكونات Radix UI.
- Supabase Auth وPostgreSQL وRow Level Security.
- pnpm 10.4.1 وNode.js 22 أو أحدث.
- اختبارات Node المدمجة وVitest وReact Testing Library.

## التشغيل المحلي

```bash
pnpm install --frozen-lockfile
pnpm dev
```

انسخ `.env.example` إلى `.env.local` وأضف فقط:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

لا تضع أي مفتاح سري أو `service_role` في متغيرات Vite أو داخل المستودع.

## المسارات الحالية

| المسار | الوحدة |
| --- | --- |
| `/login` | تسجيل الدخول |
| `/forgot-password` و`/reset-password` | استعادة كلمة المرور |
| `/accept-invite` | قبول دعوة معلم وتعيين كلمة المرور |
| `/dashboard` | لوحة التحكم |
| `/students` و`/students/new` | الطلاب والتسجيل |
| `/teachers` و`/teachers/new` | المعلمون |
| `/classes` و`/classes/new` | الحلقات وربط الطلاب والمعلمين |
| `/finance` ومساراتها الفرعية | الخطط والاستحقاقات والدفعات والمصروفات والتقارير |
| `/attendance` | الحضور والغياب |
| `/memorization` | متابعة الحفظ والمراجعة |
| `/members` | دليل أعضاء المدرسة للعرض فقط |

يظهر كل مسار محمي وفق الجلسة والمدرسة والصلاحيات المناسبة. دليل الأعضاء يتطلب `school_admin` أو الصلاحيتين `members.view` و`profiles.view` معًا، ولا يحتوي أدوات دعوة أو تعديل عضويات أو أدوار.

## قاعدة البيانات

ملفات `supabase/001_initial_schema.sql` إلى `supabase/014_memorization_module.sql` مطبقة حاليًا. يحتوي المستودع أيضًا Migration 015 لدعوات المعلمين، لكنها غير مطبقة وتحتاج تشغيلًا مستقلًا بعد المراجعة. تشمل الأساس متعدد المدارس، الطلاب، المعلمين، المالية، الحضور، والحفظ. لا تُشغّل migration مطبقة سابقًا مرة أخرى، ولا تُنشئ Migration جديدة دون مهمة مستقلة ومراجعة صريحة.

## التحقق

```bash
node --test tests/*.test.mjs
node --test tests/memorization-interface.test.mjs
node --test tests/memorization-database.test.mjs
node --test tests/members-directory.test.mjs
pnpm test:runtime
pnpm check
pnpm exec vite build
git diff --check
```

أمر `pnpm build` يشغّل مجموعة القبول الكاملة قبل إنشاء حزمة الإنتاج.

## حدود الأمان

- الوصول من المتصفح يستخدم المفتاح القابل للنشر فقط.
- عزل المدارس وعمليات القراءة والكتابة تحكمها RLS ودوال الصلاحيات الموجودة.
- يحتوي المستودع على Edge Function `invite-teacher` غير منشورة؛ تحتاج Migration 015 وCustom SMTP وRedirect allowlist قبل التشغيل.
- دعوات الموظفين وإنشاء الحسابات وإدارة العضويات والأدوار خارج نطاق دليل `/members` الحالي.
