# منصة المدرسة القرآنية الذكية — المرحلة الأولى

نسخة محمولة جاهزة للحفظ في GitHub. تحتوي على واجهة المرحلة الأولى وملفات تأسيس Supabase، لكن ربط Supabase Auth بواجهة React لم يُنفّذ بعد.

## الحالة الحالية

- React 19 + Vite 7 + TypeScript 5.9.
- Tailwind CSS 4 ومكونات Radix UI.
- واجهة عربية باتجاه RTL.
- مصادقة تجريبية مؤقتة عبر `localStorage`.
- بيانات طلاب تجريبية محلية.
- لا توجد مفاتيح أو أسرار داخل المستودع.
- لا يتصل المشروع الحالي بقاعدة Supabase أثناء التشغيل.

## المتطلبات

- Node.js 20 أو أحدث.
- pnpm 10.

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

انسخ القالب عند بدء ربط Supabase فقط:

```bash
cp .env.example .env.local
```

المتغيرات المحجوزة للربط القادم:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

لا تضع `service_role` أو أي secret key في متغير يبدأ بـ`VITE_`، لأن متغيرات Vite تصل إلى المتصفح. المرحلة الحالية تعمل من دون تعبئة هذه القيم.

## المسارات الحالية

| المسار | الصفحة |
| --- | --- |
| `/` | تحويل إلى `/login` |
| `/login` | تسجيل الدخول التجريبي |
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

- لا يوجد Supabase client داخل React بعد.
- تسجيل الدخول الحالي تجريبي وليس Supabase Auth.
- لا توجد جداول أو عمليات للطلاب والحلقات والحضور في قاعدة البيانات ضمن هذه المرحلة.
- لا توجد اختبارات آلية حاليًا.
- لا توجد عملية نشر GitHub Actions ضمن هذه النسخة.
