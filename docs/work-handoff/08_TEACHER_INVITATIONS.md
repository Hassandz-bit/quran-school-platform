# 08 — دعوات المعلمين وربط الحسابات

## حالة هذه المرحلة

- Issue: #35.
- Base SHA: `67cd3705effee0303f5b44ed713f4922025d6ea2` بعد دمج PR #34.
- الفرع: `agent/secure-teacher-invitations`.
- Migration 015 موجودة للمراجعة والاختبار المحلي فقط ولم تُطبق على الإنتاج.
- Edge Function `invite-teacher` موجودة في المستودع فقط ولم تُنشر.
- لم تُرسل دعوة بريدية ولم يُنشأ مستخدم Auth حقيقي.

## حدود النطاق

هذه الدورة تدعو سجل معلم موجودًا فقط. الدور ثابت `teacher`، ونطاقه ثابت بفرع المعلم. لا يقبل العميل أو الـFunction معرف دور أو فرع أو Profile أو اسمًا أو redirect أو صلاحيات.

إدارة بقية الموظفين وإدارة الأدوار العامة خارج هذا النطاق.

## التصميم الأمني

1. تتحقق الواجهة من الصلاحيات المدرسية الثلاث لإظهار الزر فقط:
   - `members.manage`
   - `members.assign_roles`
   - `teachers.manage`
2. يعيد Edge Function التحقق من JWT ومن الصلاحيات الثلاث باستخدام عميل مربوط بجلسة المستدعي وRLS.
3. بعد التفويض فقط يستخدم عميل الخادم الموثوق للتحقق النهائي من المعلم والبريد والدعوات السابقة.
4. تستخرج قاعدة البيانات اسم المعلم وفرعه ودور `teacher` النشط؛ لا تثق بقيم إدارية من الطلب.
5. تسجل المحاولة `processing` بمفتاح idempotency UUID، ثم تستدعي Auth invitation.
6. تستخدم الدالة `public.provision_teacher_invitation` معرف المستخدم الناتج وتنفذ Profile وMembership والدور وربط المعلم وتحديث الدعوة داخل transaction واحدة.
7. لا يملك `authenticated` تنفيذ دالة التجهيز المميزة، ولا يملك المتصفح INSERT أو UPDATE أو DELETE على جدول الدعوات.

## ترتيب العملية

1. CORS وmethod وContent-Type وحجم body.
2. JWT صالح وهوية المستدعي من Auth.
3. الصلاحيات الثلاث معًا.
4. `schoolId` و`teacherId` وemail normalized فقط؛ ترفض الحقول الزائدة.
5. التحقق أن المعلم نشط، غير مربوط، في المدرسة والفرع النشطين، ولا توجد دعوة نشطة أو معلم آخر بالبريد نفسه.
6. إنشاء محاولة `processing` محمية بقيود فريدة وidempotency.
7. التحقق أن البريد لا يعود إلى Auth user سابق.
8. استدعاء `inviteUserByEmail` بعنوان خادمي `PUBLIC_SITE_URL/accept-invite`.
9. تمرير `data.user.id` إلى RPC التجهيز الذري.
10. إعادة نتيجة عامة دون رابط الدعوة أو بيانات سرية.

## التعويض وحدوده

إذا أنشأت هذه المحاولة مستخدم Auth ثم فشل RPC:

- يُحذف فقط معرف المستخدم الذي أعاده استدعاء الدعوة لهذه المحاولة نفسها.
- يجري فحص وجود Auth user قبل الدعوة، لذلك لا يدخل مستخدم سابق في مسار الحذف.
- لا يُحذف Teacher أو Profile أو Membership أو دور قائم.
- تتحول محاولة الدعوة إلى `failed` برمز عام مثل `provisioning_failed`.
- لا تسجل الرسائل الداخلية أو JWT أو رابط الدعوة.

## قبول الدعوة

- المسار `/accept-invite` مستقل عن `/reset-password`.
- لا يظهر نموذج كلمة المرور دون session صالحة وعلامة `type=invite` ملتقطة من الرابط.
- يستعمل `auth.updateUser({ password })` ثم RPC مقيدة بـ`auth.uid()` لتحديث دعوته هو فقط إلى `accepted`.
- يبقى شرط `PASSWORD_RECOVERY` في ResetPassword دون تغيير.
- إذا نجحت كلمة المرور وفشل تحديث حالة الدعوة، تبقى كلمة المرور الجديدة ويظهر تحذير آمن مع متابعة إلى لوحة التحكم.

## إعدادات Auth والبريد — قراءة فقط

- مشروع Supabase: `dexquxtymmoyfzehjicf`.
- Project URL: `https://dexquxtymmoyfzehjicf.supabase.co`.
- لا توجد Edge Functions منشورة وقت إعداد PR.
- لم تكن إعدادات Site URL وRedirect allowlist وCustom SMTP وقالب Invite متاحة عبر صلاحيات القراءة الحالية للموصل؛ لذلك لم يُفترض وضعها ولم تُغيّر.
- عنوان التشغيل المطلوب التحقق من إضافته قبل الإرسال:
  `https://quran-school-platform-livid.vercel.app/accept-invite`
- يجب ألا يستخدم Preview URL تلقائيًا في دعوة إنتاجية.

## مراجع Supabase الرسمية

- Admin invite: https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail
- Redirect URLs: https://supabase.com/docs/guides/auth/redirect-urls
- Custom SMTP: https://supabase.com/docs/guides/auth/auth-smtp
- Email templates: https://supabase.com/docs/guides/auth/auth-email-templates
- Edge Functions Auth: https://supabase.com/docs/guides/functions/auth
- API keys: https://supabase.com/docs/guides/api/api-keys
- CLI: https://supabase.com/docs/reference/cli

القرارات: مفاتيح الخادم داخل بيئة Function فقط، المفتاح القابل للنشر مع JWT المستخدم لفحص التفويض، imports مثبتة، ولا يعتمد التفويض على `user_metadata`.

## خطوات ما قبل الاختبار التشغيلي

1. إعداد Custom SMTP مناسب للإنتاج وتعطيل tracking الذي يغير روابط Auth إن وجد.
2. التحقق من Site URL العام.
3. إضافة `https://quran-school-platform-livid.vercel.app/accept-invite` إلى Redirect allowlist.
4. تخصيص قالب Invite User عند توفر ذلك واختباره دون أسرار.
5. مراجعة بريد المعلم المطلوب إدخاله.
6. أخذ نسخة احتياطية والتحقق من Base/Head.
7. تطبيق Migration 015 مرة واحدة فقط.
8. إعداد `PUBLIC_SITE_URL` و`ALLOWED_ORIGINS` ومفاتيح Supabase الموثوقة كأسرار Function، دون إضافتها للمستودع.
9. نشر `invite-teacher` مع JWT verification مفعل.
10. إرسال دعوة واحدة فقط للمعلم المؤهل.
11. فتح الرابط في جلسة جديدة، تعيين كلمة المرور، والتحقق من العضوية ودور `teacher` في فرع المعلم فقط.
12. التحقق من اختفاء المعلم من قائمة المؤهلين وعدم إنشاء دعوة ثانية.

## خطة التراجع

قبل إرسال أي دعوة:

- يمكن التراجع بإلغاء نشر Function ثم التراجع عن Migration 015 في نافذة صيانة مدروسة، ما دام الجدول خاليًا ولم تُنشأ حسابات.

بعد إنشاء دعوة أو حساب:

- لا تنفذ حذفًا جماعيًا ولا تعدل البيانات يدويًا.
- أوقف Function أولًا، وثبت حالة Auth/Profile/Membership/Teacher/Invitation، ثم استخدم خطة إصلاح مخصصة للسجل المتأثر.
- لا تعد Migration 014 ولا تمس فروع `backup/*`.

## نتائج التحقق على Head الوظيفي

- جميع اختبارات Node: 216/216.
- اختبارات دليل الأعضاء منفردة: 9/9.
- واجهة الحفظ منفردة: 27/27.
- قاعدة الحفظ منفردة: 14/14.
- اختبارات دعوات المعلمين الثابتة: 9/9.
- Runtime الكامل: 16/16، ومنها دعوات المعلمين منفردة 9/9.
- Edge Function Deno: 20/20، و`deno check` ناجح.
- Migration 015 على PostgreSQL 17 محلي: ناجحة، ومنها rollback والقيود والـGRANTs.
- TypeScript وVite build و`git diff --check` وفحوص الأسرار والنطاق: ناجحة.


## معالجة المراجعة الأمنية اللاحقة

- تتحقق RPC الذرية من بريد `auth.users` للمعرف المدعو مقابل بريد الطلب وسجل الدعوة بعد التطبيع، قبل إنشاء Profile أو Membership.
- حد `profiles.full_name` من Migration 001 هو 2 إلى 150 حرفًا؛ يتحقق Edge Function منه قبل إرسال البريد وتعيد Migration التحقق دفاعيًا قبل INSERT.
- فحص الدعوة النشطة مقيد بـ`school_id` للمعلم والبريد، فلا يمنع البريد نفسه مدرسة أخرى.
- SELECT المباشر على `teacher_invitations` مقتصر على الإداري صاحب الصلاحيات الثلاث، ويقرأ المستلم سياقه فقط عبر `get_my_teacher_invitation()`.
- تغطي الاختبارات rollback لبريد Auth المخالف والاسم الطويل، وعزل المدرستين، ومنع SELECT المباشر مع نجاح RPC الآمنة.
