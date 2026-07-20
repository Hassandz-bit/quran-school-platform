# منصة المدرسة القرآنية الذكية — المرحلة الأولى

نسخة محمولة لواجهة المرحلة الأولى مع مصادقة Supabase عبر البريد الإلكتروني وكلمة المرور وملفات تأسيس قاعدة البيانات.

## الحالة الحالية

- React 19 + Vite 7 + TypeScript 5.9.
- Tailwind CSS 4 ومكونات Radix UI.
- واجهة عربية باتجاه RTL.
- مصادقة Supabase مع حفظ الجلسة وتجديدها تلقائيًا.
- بيانات طلاب تجريبية محلية.
- لا توجد مفاتيح أو أسرار داخل المستودع.
- لا تنفذ الواجهة أي استعلامات على جداول قاعدة البيانات في هذه المرحلة.

## المتطلبات

- Node.js 22 أو أحدث.
- pnpm 10.4.1.

## التثبيت والتشغيل

```bash
pnpm install --frozen-lockfile
pnpm dev
```

يفتح Vite افتراضيًا على:

```text
http://localhost:5173
```

## أوامر التحقق والبناء

```bash
pnpm check
pnpm build
pnpm preview
```

لا يحتوي المشروع حاليًا على test script أو ملفات اختبار آلية.

## متغيرات البيئة

انسخ قالب البيئة قبل تشغيل مصادقة Supabase:

```bash
cp .env.example .env.local
```

المتغيرات المطلوبة:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

لا تضع أي مفتاح سري في متغير يبدأ بـ`VITE_`، لأن متغيرات Vite تصل إلى المتصفح. ضع القيم الحقيقية في `.env.local` فقط ولا ترفعها إلى Git.

## المسارات الحالية

| المسار | الصفحة |
| --- | --- |
| `/` | تحويل إلى `/login` |
| `/login` | تسجيل الدخول عبر Supabase |
| `/forgot-password` | طلب رابط استعادة كلمة المرور |
| `/reset-password` | تعيين كلمة مرور جديدة |
| `/dashboard` | لوحة المدير |
| `/students` | قائمة الطلاب |
| `/students/new` | إضافة طالب عبر نموذج من 6 خطوات |

## هيكل المشروع

```text
.
├── client/
│   ├── public/
│   ├── index.html
│   └── src/
│       ├── _core/hooks/useAuth.ts
│       ├── components/
│       ├── contexts/
│       ├── hooks/
│       ├── lib/
│       ├── mock-data/
│       ├── pages/
│       ├── App.tsx
│       ├── index.css
│       └── main.tsx
├── supabase/
│   ├── 001_initial_schema.sql
│   ├── 002_rls_policies.sql
│   ├── 003_bootstrap_first_admin.sql
│   └── seed.sql
├── .env.example
├── .gitignore
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
└── vite.config.ts
```

## ملفات Supabase

ملفات `supabase/` محفوظة كمرجع ومراحل تنفيذ منفصلة. لم تُشغّل أثناء تجهيز هذه النسخة.

الترتيب التاريخي للمشروع:

1. `001_initial_schema.sql` — الجداول والعلاقات والفهارس.
2. `002_rls_policies.sql` — دوال وسياسات Row Level Security.
3. `seed.sql` — المدرسة التجريبية والفرع والأدوار والصلاحيات.
4. `003_bootstrap_first_admin.sql` — ربط مستخدم Auth موجود بأول عضوية إدارية بعد استبدال `__AUTH_USER_ID__`.

لا تشغّل `003_bootstrap_first_admin.sql` قبل مراجعة UUID والتأكد من أن المستخدم موجود في Supabase Auth.

## حدود المرحلة

- مصادقة Supabase فقط؛ لا توجد قراءة للملفات الشخصية أو العضويات أو الأدوار بعد.
- لا توجد جداول أو عمليات للطلاب والحلقات والحضور في قاعدة البيانات ضمن هذه المرحلة.
- لا توجد اختبارات آلية حاليًا.
- لا توجد عملية نشر GitHub Actions ضمن هذه النسخة.
