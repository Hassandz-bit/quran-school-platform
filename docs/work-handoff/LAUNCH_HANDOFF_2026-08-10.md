# QuranOS — Final Launch Handoff / Resume

آخر تحديث: 2026-08-10 — FINAL LAUNCH HARDENING / DAY 4

> هذه الوثيقة هي المصدر التشغيلي الأحدث للاستئناف. إذا تعارضت معها وثيقة أقدم داخل `docs/work-handoff` فهذه الوثيقة هي المعتمدة. يجب دائمًا جلب `main` الفعلي أولًا لأن SHA المدوّن هنا لقطة زمنية وليس مرجعًا دائمًا.

## 1. الحالة الحالية المؤكدة

- المستودع: `Hassandz-bit/quran-school-platform`
- `main`: `bfe2e9f9d7b6febac88ebd71a76cd6ead613e3fd`
- آخر PR مدمج: #56 — `feat: add safe demo mode and richer student profiles` — Squash Merge.
- Vercel Production للنشر المرتبط بـ`main` أعلاه: ناجح.
- Vercel Runtime Errors في فحص 2026-08-10 لآخر 24 ساعة: لا توجد أخطاء مجمعة.
- Supabase Production project ref: `dexquxtymmoyfzehjicf`.
- Production migrations مطبقة حتى 022.
- Edge Functions الإنتاجية الحالية: `invite-teacher` و`invite-guardian` فقط، وكلتاهما ACTIVE و`verify_jwt=true`.
- Launch Readiness Gate على الرأس النهائي لـPR #56 (`009d571aa99123606fff9a04b90ae2036e0915ee`) نجح بالكامل.
- لم يظهر في فحص Day 4 الحالي Launch Blocker حقيقي من CI أو Vercel runtime أو قائمة الصلاحيات الفعلية في Production.
- لم يُنفذ أثناء هذا الفحص أي إنشاء مستخدم، دعوة حقيقية، Migration، نشر Edge Function، أو تعديل بيانات Production.

المنصة ما تزال في مرحلة **pre-launch / final launch hardening**. نجاح البوابات التقنية لا يعني وحده قرار إطلاق تجاري نهائي؛ يبقى قرار الإطلاق منفصلًا بعد الاختبارات التشغيلية المتحكم بها.

## 2. الممنوعات التشغيلية

- لا تُعد تطبيق migrations 015–022 على Production.
- لا تعد نشر Edge Functions القديمة لمجرد وجودها في المستودع.
- لا ترسل دعوات معلم أو ولي أمر حقيقية، ولا تنشئ Guardian/Auth user تجريبي على Production، إلا بتفويض واضح ومقصود.
- لا تستخدم `service_role` داخل المتصفح أو متغيرات Vite.
- لا توسع RLS لولي الأمر على الجداول الأساسية لمجرد تسهيل الواجهة.
- لا تنشئ `school_membership` لمستخدم لمجرد أنه ولي أمر.
- لا تعتمد legacy role باسم `guardian` كمصدر وصول للـParent Portal.
- لا تغيّر SECURITY DEFINER RPCs أو تحذيرات Advisors ميكانيكيًا دون مراجعة عقد الصلاحيات الداخلي.
- لا تدخل تحسينات UI تجميلية في مرحلة Launch Blocker إلا إذا كانت تمنع الاستخدام فعلًا.

## 3. Architecture ومجلدات المستودع

QuranOS تطبيق ويب عربي RTL متعدد المدارس:

- `client/`: واجهة React 19 + TypeScript + Vite، المسارات، الصفحات، AppShell، طبقة Supabase client، ومكونات الواجهة.
- `supabase/`: migrations/SQL وEdge Functions.
- `supabase/functions/invite-teacher/`: دعوة الموظف/المعلم.
- `supabase/functions/invite-guardian/`: دعوة ولي الأمر وربط تفعيل الحساب.
- `tests/`: اختبارات Node وVitest/runtime واختبارات migrations وEdge Functions.
- `.github/workflows/`: Launch Readiness والبوابات الآلية.
- `docs/work-handoff/`: سجل الاكتشافات والقرارات ووثائق الاستئناف.

التقنيات الأساسية:

- React 19، Vite 7، TypeScript 5.9.
- Tailwind CSS 4 + Radix UI.
- Supabase Auth + PostgreSQL + RLS + Storage + RPC.
- pnpm 10.4.1.
- Node tests + Vitest + React Testing Library + Deno tests للـEdge Functions.
- Vercel للاستضافة والنشر.

## 4. الموديولات والوظائف الأساسية

### المصادقة والتوجيه

المسارات الأساسية:

- `/`
- `/login`
- `/forgot-password`
- `/reset-password`
- `/post-login`
- `/accept-invite`
- `/accept-guardian-invite`

`/post-login` هو نقطة التوجيه المركزية بعد المصادقة/الاستعادة/التفعيل. الموظف + ولي الأمر في الحساب نفسه مسموح؛ المسار الافتراضي يبقى staff landing، بينما `/parent` يبقى متاحًا عند وجود علاقة Guardian نشطة.

### Staff / School

- `/dashboard`
- `/students`
- `/students/new`
- `/teachers`
- `/teachers/new`
- `/classes`
- `/classes/new`
- `/members`
- `/attendance`
- `/memorization`
- `/academic-reports`
- `/finance` ومسارات الرسوم والاستحقاقات والمدفوعات والمصروفات والتقارير.

### Parent

- `/parent`
- `/parent/students/:studentId`

## 5. Supabase migrations — Production through 022

المigrations الحرجة المؤكدة والمطبقة مرة واحدة:

- `20260801074136` — `015_teacher_invitations`
- `20260808092035` — `016_memorization_class_teachers_rpc`
- `20260808214224` — `017_guardian_security_foundation`
- `20260809105742` — `018_guardian_invitations`
- `20260809112918` — `019_guardian_parent_academic_reads`
- `20260809130921` — `020_guardian_parent_finance_reads`
- `20260810001537` — `021_demo_mode_student_profile`
- `20260810001629` — `022_student_profile_column_privileges`

مهم:

- 021 تضيف Demo Mode الآمن وحقول الملف الدراسي/الصورة والبنية المرتبطة.
- 022 تضيف **Column Privileges فقط** اللازمة لحقول الطالب الجديدة؛ لا تمنح INSERT/UPDATE عامًا على جدول الطلاب.
- لا تُعد تطبيق أي migration من 015 إلى 022.

## 6. Edge Functions الحالية في Production

### `invite-teacher`

- id: `f4957ed6-403b-424a-bae1-bf745a0b7330`
- version: 1
- status: ACTIVE
- `verify_jwt=true`
- deployed SHA256: `67de6dd9810481a412a0cb97d58169acb3d6fb7b67936f9aee829dfc925e1bbb`

### `invite-guardian`

- id: `9adc016d-8bc9-4462-a189-4e6512c5e5d8`
- version: 1
- status: ACTIVE
- `verify_jwt=true`
- deployed SHA256: `94a785ad31a609b59112029ab4de453a0d067725ce5d0ba4fdc340076d66de8e`

لا يوجد سبب حالي لإعادة نشر أي منهما.

## 7. Roles / Permissions / RLS

الأدوار الأساسية المراجعة للإطلاق:

- `school_admin`
- `teacher`
- `academic_supervisor`
- `finance_officer`
- `registrar`
- `branch_manager`
- Guardian ليس staff role معتمدًا للوصول إلى Parent Portal؛ الوصول وليّ الأمري يأتي من العلاقة `student_guardians`.

لقطة Production لصلاحيات الأدوار الأساسية في فحص Day 4:

### `school_admin`

يمتلك صلاحيات إدارة/عرض المدرسة والفروع والحلقات والطلاب والمعلمين والحضور والحفظ والمالية والأعضاء والأدوار، وجميع صلاحيات Guardian الست:

- `guardians.view`
- `guardians.view_contacts`
- `guardians.link`
- `guardians.invite`
- `guardians.revoke`
- `guardians.audit`

### `registrar`

يمتلك إدارة/عرض الطلاب والأعضاء والملفات، وصلاحيات Guardian التالية:

- `guardians.view`
- `guardians.view_contacts`
- `guardians.link`
- `guardians.invite`
- `guardians.revoke`

ولا يملك `guardians.audit` افتراضيًا.

### `teacher`

يمتلك نطاق الحضور والحفظ مع العرض اللازم للمدرسة/الفروع/الحلقات/الطلاب، ويظل الوصول مقيدًا بالتعيين والنطاق عبر RLS/RPC.

### `academic_supervisor`

يمتلك قراءات الطلاب/الحلقات والحضور والحفظ مع إدارة/عرض المعلمين، دون صلاحيات Guardian افتراضية.

### `finance_officer`

يمتلك `finance.view`, `finance.manage`, `finance.expenses` مع عرض المدرسة/الفروع، دون صلاحيات Guardian افتراضية.

### RLS / RPC principle

- UI visibility ليست مصدر الأمان.
- RLS/RPC والتحقق من membership/permission/guardian relation هي مصدر الحقيقة.
- Parent/Guardian لا يحصل على توسيع RLS مباشر على جداول attendance/memorization/finance الأساسية.
- القراءة الأبوية تمر عبر RPCs محدودة تتحقق من العلاقة النشطة في كل طلب.

## 8. Guardian Model B+ — ثابت معماري

النموذج المعتمد:

- Auth account عالمي واحد.
- Profile عالمي واحد.
- علاقة ولي الأمر بالطالب عبر `student_guardians`.
- لا يلزم staff `school_membership` لولي الأمر.
- العلاقة لها lifecycle مستقل (`pending` / `active` / `revoked`).
- يمكن للحساب نفسه أن يكون موظفًا وولي أمر في آن واحد.
- يمكن لولي الأمر أن يرتبط بأكثر من طالب، وعبر أكثر من مدرسة، بعلاقات مستقلة.
- إلغاء العلاقة يجب أن يوقف وصول ذلك الطالب فورًا دون تعطيل حساب المستخدم عالميًا.
- `guardian_access_events` مخصص للتدقيق.

دعوات ولي الأمر صُممت لتجنب كشف ما إذا كان البريد يملك حسابًا سابقًا أو حالته، مع idempotency وضوابط retry/activation.

## 9. Parent Portal

الـParent Portal core مكتمل وظيفيًا:

- قبول/تفعيل الدعوة.
- قائمة الأبناء المصرح بهم فقط.
- صفحة الطالب لولي الأمر.
- ملخص وسجل الحضور.
- ملخص وسجل الحفظ.
- الملخص المالي.
- قائمة الرسوم والمدفوعات ضمن النطاق المصرح.

Academic RPCs من 019:

- `list_my_guardian_students()`
- `get_my_guardian_student_attendance_summary(...)`
- `list_my_guardian_student_attendance(...)`
- `get_my_guardian_student_memorization_summary(...)`
- `list_my_guardian_student_memorization(...)`

Finance RPCs من 020:

- `get_my_guardian_student_finance_summary(...)`
- `list_my_guardian_student_charges(...)`
- `list_my_guardian_student_payments(...)`

هذه RPCs SECURITY DEFINER المقصودة تكون browser-callable للمستخدم `authenticated` مع authorization داخل الدالة؛ لا تحول تحذير Advisor بحد ذاته إلى سبب لإلغاء EXECUTE.

## 10. Student360

Student360 ملف طالب read-only شامل، يتضمن:

- بيانات الطالب الأساسية.
- المدرسة/الفرع/الحلقة.
- ملخص الحضور.
- متابعة الحفظ وآخر النشاطات.
- المالية.
- الصورة الخاصة عند وجودها.
- المرحلة الدراسية والسنة الدراسية.

المنطق المالي يحافظ على حساب الإجماليات من كل المدفوعات المؤهلة، بينما قائمة النشاطات الأخيرة محدودة، وتُستبعد الرسوم الملغاة/المعفاة وفق العقد الحالي.

## 11. Academic Reports

`/academic-reports` منفصل عن تقارير المالية، وهو read-only للتحليل الأكاديمي ويعتمد صلاحيات ونطاقات القراءة الأكاديمية بدل قصره على مدير المدرسة فقط. يدعم العرض/التصفية والتصدير/الطباعة وفق التنفيذ الحالي.

PR #49 أصلح route access ليطابق scoped academic access بدل admin-only routing.

## 12. Finance

الوحدة المالية تشمل:

- Fee Plans.
- Student Charges.
- Payments.
- Expenses.
- Finance Dashboard/Reports.

الصلاحيات الأساسية:

- `finance.view`
- `finance.manage`
- `finance.expenses`

الوصول يظل school/branch scoped وفق RLS ودوال الصلاحيات. Parent finance reads لا تعيد استخدام صلاحيات staff ولا توسع RLS، بل تمر عبر RPCs الخاصة بGuardian.

## 13. Attendance

الحضور يدعم العرض والإدارة بحسب الدور والنطاق. Teacher access يظل مربوطًا بما هو مسموح من assignment/class scope، مع دوال وصول مخصصة مثل `can_access_attendance_class(...)`.

أعمال الحضور القديمة موثقة أيضًا في `01_ATTENDANCE_DISCOVERY.md` حتى `04_ATTENDANCE_INTERFACE.md`، لكن هذه الوثيقة هي المرجع الأعلى للحالة الحالية.

## 14. Memorization

وحدة الحفظ تدعم العرض والإدارة بحسب الدور والتعيين، مع RPC `list_memorization_class_teachers(...)` و`can_access_memorization_class(...)` لتجاوز مشكلة القراءة المباشرة المقيدة بـRLS دون توسيع غير ضروري.

Migration 016 الخاصة بـmemorization teacher RPC مطبقة بالفعل ولا تُعاد.

## 15. Demo Mode

PR #56 أضاف Demo Mode مخصصًا لمدير المدرسة فقط.

خصائصه:

- إنشاء batch مركزي وتتبع كل سجل Demo بدل نشر عمود `is_demo` على جداول الأعمال.
- ينشئ بيانات عرض مترابطة: 20 طالبًا، معلمين، حلقتين، حضور، حفظ، رسوم/مدفوعات ومصاريف.
- لا ينشئ Auth users.
- لا يرسل staff/guardian invitations.
- لا ينشئ guardian relationships.
- التنظيف Fail-Closed: إذا اختلطت كيانات Demo بعلاقات/دعوات/بيانات حقيقية حساسة، يرفض التنظيف بدل المخاطرة بحذف بيانات حقيقية.
- التحكم من Dashboard مع تأكيد قبل التنظيف.

Production verification بعد 021/022:

- `demo_batches = 0`
- `demo_records = 0`
- لا صور Demo أُنشئت.
- البيانات الحقيقية الموجودة لم تتغير.

لا تفترض أن هذه العدادات ستظل صفرًا بعد بدء عروض فعلية؛ افحص الحالة قبل أي cleanup.

## 16. Student photo + education

حقول الملف الدراسي الجديدة:

- `education_stage`: `primary` / `middle` / `secondary` / `university`.
- `education_year`: سنة مرتبطة بالمرحلة.
- `photo_path`: مسار الصورة الخاصة.

Storage:

- bucket: `student-photos`.
- Private، وليس Public.
- حد الملف: 5MB.
- الأنواع: JPEG / PNG / WebP.
- سياسات القراءة/الكتابة مربوطة بصلاحيات الطالب الموجودة، لا وصول عام.

Student creation يدعم preview/upload، وStudent360 يعرض الصورة والتعليم.

## 17. PR milestones

المعالم الرئيسية الأخيرة:

- #39 — default role routes.
- #40 — Migration 016 memorization class teachers RPC.
- #41 — Mobile AppShell refresh Phase 1.
- #42 — Student360.
- #43 — Academic Reports.
- #44 وما تلاه — Guardian security foundation / Migration 017 ضمن سلسلة Guardian.
- Guardian invitation/activation + Parent academic + Parent finance اكتملت عبر سلسلة PRs حتى Migration 020.
- #48 — Guardian activation success -> `/post-login`.
- #49 — Academic Reports route aligned with scoped access.
- #50 — root/login preserve active sessions and use `/post-login`.
- #51 — password recovery success -> `/post-login`.
- #52 — consolidated Launch Readiness Gate + Vitest Production isolation.
- #53 — verified pre-launch handoff refresh.
- #54 — branch manager scoped routing fix.
- #55 — documented functional baseline after #54.
- #56 — safe Demo Mode + richer student profiles + migrations 021/022; merged to current `main`.

## 18. الاختبارات وCI

`package.json` الحالي يجعل `pnpm build` gate حقيقيًا، لا مجرد bundling. يشغّل:

- Node test suites.
- memorization interface/database tests.
- Vitest runtime suite.
- `tsc --noEmit`.
- Vite production build.
- `git diff --check`.

Runtime suite تشمل حاليًا، من بين غيرها:

- test environment isolation.
- memorization runtime/RPC.
- members runtime.
- teacher invitations runtime.
- guardian invitations runtime.
- Student360 runtime.
- Academic Reports runtime.
- Guardian parent academic runtime.
- Guardian parent finance runtime.

Launch Readiness workflow:

`.github/workflows/launch-readiness-validation.yml`

في run الخاص بالرأس النهائي لـPR #56، Job `Full launch readiness gate` نجح في جميع الخطوات، بما فيها:

- exact source checkout.
- Node/Deno setup.
- frozen dependency install.
- full app build + JS/TS/runtime suite.
- teacher invitation migration test.
- memorization teacher RPC migration test.
- Guardian security foundation migration test.
- Guardian invitation migration test.
- Guardian parent academic migration test.
- Guardian parent finance migration test.
- Demo Mode/student profile migration test.
- teacher invitation Edge Function test.
- guardian invitation Edge Function test.
- final whitespace check.

### Test isolation invariant

Vitest يجب ألا يرث Production Supabase variables أثناء CI/Vercel builds.

`vitest.config.ts` يفرض test values محلية، و`tests/test-environment-isolation.test.ts` يتحقق أن Production project ref غير موجود. لا تُضعف هذا العزل دون بديل مكافئ.

## 19. Final smoke-test status by role

هذه اللقطة تميز بين **evidence-backed automated/static smoke** وبين **real-account Production E2E**.

### School Admin

- routing/permissions/build coverage: PASS.
- Demo Mode admin-only path/migration/runtime coverage: PASS.
- Production role permissions present as expected: PASS.
- real-account mutating E2E في Day 4: لم يُعد تشغيله لتجنب تعديل بيانات حقيقية بلا حاجة.

### Teacher

- attendance/memorization permission contract: PASS.
- invitation runtime + migration + Edge Function suites: PASS.
- scoped memorization teacher RPC validation: PASS.
- real invitation not resent in Day 4.

### Academic Supervisor

- Production permission set matches scoped academic read/teacher management contract: PASS.
- Academic Reports runtime gate: PASS.
- no dedicated real-account E2E repeated in Day 4.

### Finance Officer

- Production permission set matches finance contract: PASS.
- finance build/runtime surface remains green under consolidated gate.
- Parent finance uses separate Guardian RPC path, not staff permission leakage.
- no real financial mutation performed.

### Registrar

- Production permission set includes student/member management and Guardian view/contact/link/invite/revoke, excludes audit as designed: PASS.
- Guardian invitation runtime/migration/function gates: PASS.
- no real Guardian invite sent.

### Guardian

- invitation, activation routing, parent academic runtime/migration, parent finance runtime/migration: PASS.
- Model B+ invariant preserved.
- no new Production Guardian account/invitation created in Day 4; therefore a fresh real-email E2E was intentionally not repeated.

### Dual staff + guardian

- architecture/routing contract supports staff default landing + `/parent` access when active Guardian relation exists.
- no separate Production dual-role test account was created in Day 4.
- treat a controlled real-account E2E as a release-confidence check, not as a reason to invent Production identities during hardening.

## 20. Supabase Advisors — intentional vs actionable

Security Advisor Day 4 reports:

### Intentional INFO

- `demo_seed_batches`: RLS enabled, no policies.
- `demo_seed_records`: RLS enabled, no policies.
- `guardian_invitations`: RLS enabled, no policies.

هذه جداول workflow/internal tracking مغلقة عن direct browser table access؛ غياب policy هنا مقصود ضمن التصميم الحالي ولا يثبت ثغرة.

### Expected SECURITY DEFINER warnings

Advisor يحذر أن عدة SECURITY DEFINER functions قابلة للاستدعاء من `authenticated`, ومنها auth/permission helpers وGuardian/Parent/Demo RPCs.

هذا **ليس تلقائيًا blocker** لأن هذه الدوال صُممت لتكون callable ثم تنفذ authorization داخليًا، مع عقود RLS/RPC واختبارات migrations. لا تسحب EXECUTE جماعيًا لمجرد التحذير؛ راجع كل دالة وعقدها إن تغيرت.

### Actionable hardening, not proven blocker

- Leaked Password Protection disabled.

هذا تحسين أمني موصى به، لكنه يحتاج قرارًا مقصودًا لأن تفعيله قد يؤثر على تجربة كلمات المرور/المستخدمين الحاليين. رابط Supabase Advisor/Docs هو المرجع عند اتخاذ القرار.

Performance Advisor findings التاريخية مثل unindexed FKs / unused indexes / duplicate permissive policies تعامل كصيانة أداء ما لم يظهر أثر تشغيل فعلي. لا تغيّر indexes/policies قبل الإطلاق بلا دليل workload.

## 21. القيود والملاحظات المعروفة

- لا يوجد دليل حالي على Runtime Error في Vercel خلال نافذة 24 ساعة التي فُحصت في Day 4.
- GitHub branch protection/ruleset كان غير مفروض في آخر audit معروف؛ قبل تعدد المطورين/الوكلاء، اجعل PR + checks المطلوبة إلزامية.
- README الجذري قد يحتوي معلومات تشغيلية أقدم من هذه الوثيقة؛ لا تستخدمه كمرجع لحالة migrations/Edge Functions الحالية قبل تحديثه.
- E2E الحقيقي لدعوات Guardian يتطلب بريدًا/Auth flow حقيقيًا؛ لا يُعاد لمجرد smoke إذا كان سيخلق بيانات Production بلا حاجة.
- UI polish مؤجل عمدًا بعد تثبيت الوظائف والأمان.
- custom web domain/branding قرار إطلاق/منتج وليس blocker وظيفيًا بحد ذاته إذا كان نطاق Vercel المعتمد يعمل.

## 22. Roadmap المؤجل

ليس Launch Blocker للنسخة الحالية:

- Google OAuth/login — يضاف لاحقًا كطريقة مصادقة فقط، وليس كـauthorization بديل عن RLS/roles/guardian relations.
- Registration CRM.
- Documents center.
- WhatsApp/SMS/comms.
- gamification/evaluations.
- teacher performance.
- activities/camps/supplies.
- QuranOS intelligence / advanced analytics.
- visual/mobile polish الإضافي.

## 23. ما تبقى قبل قرار الإطلاق النهائي

ترتيب آمن:

1. أبقِ Launch Readiness Gate أخضر على أي تغيير لاحق.
2. نفّذ فقط controlled E2E بحسابات مصرح بها إن كان ذلك مطلوبًا لقرار الإطلاق، من دون لمس سجلات غير مخصصة للاختبار.
3. Guardian fresh-invite E2E وDual staff+guardian E2E لا ينفذان إلا بحساب/طالب اختبار واضح ومصرح به.
4. تحقق مرة واحدة من password-reset عبر رابط بريد فعلي لحساب اختبار مصرح به إذا لم يُوثق ذلك نهائيًا.
5. راجع Vercel Production/Preview env vars وSupabase Auth Site URL/Redirect allowlist تشغيليًا قبل إعلان الإطلاق.
6. قرر Leaked Password Protection عمدًا.
7. فعّل GitHub branch protection/ruleset وrequired checks قبل توسيع فريق التطوير.
8. اتخذ launch/no-launch decision منفصلًا عن مجرد نجاح CI.
9. بعد الإطلاق الوظيفي، ابدأ UI polish وGoogle OAuth والـroadmap المؤجل في PRs مستقلة.

## 24. خطوات الاستكمال الدقيقة بعد انتهاء الاشتراك أو في دردشة جديدة

ابدأ بهذه الخطوات فقط:

1. افتح المستودع `Hassandz-bit/quran-school-platform`.
2. اجلب `main` الفعلي وتحقق من SHA؛ لا تفترض أن `bfe2e9f...` ما يزال الأحدث.
3. اقرأ هذه الوثيقة أولًا: `docs/work-handoff/LAUNCH_HANDOFF_2026-08-10.md`.
4. اقرأ `CURRENT_PROJECT_STATE.md` و`NEXT_TASK.md` فقط بعد مطابقتها مع `main` الحالي.
5. افحص آخر Launch Readiness run على أحدث commit.
6. افحص آخر Vercel Production deployment وruntime errors قبل تشخيص مشكلة تشغيلية.
7. في Supabase Production، **list migrations أولًا**؛ لا تطبق migration قديمة بناءً على الملفات وحدها.
8. **list Edge Functions أولًا**؛ لا تعيد deploy لدالة موجودة بلا سبب.
9. حافظ على Guardian Model B+ وعزل Vitest عن Production.
10. لا تنشئ Auth users أو ترسل دعوات أو تعدل بيانات حقيقية لمجرد اختبار smoke.
11. إذا لم توجد Launch Blockers، لا تفتح PR كود تجميلي؛ انتقل إلى قرار الإطلاق/التوثيق ثم roadmap المنفصل.
12. Google OAuth مؤجل؛ عند البدء به لاحقًا لا تغيّر authorization model.

## 25. Snapshot الخلاصة

عند لقطة Day 4 الحالية:

- `main`: `bfe2e9f9d7b6febac88ebd71a76cd6ead613e3fd`.
- PR #56 مدمج.
- Vercel Production: Success، ولا runtime errors مجمعة خلال آخر 24h في الفحص الحالي.
- Supabase migrations: through 022.
- Edge Functions: invite-teacher + invite-guardian، ACTIVE، JWT verified.
- CI Launch Readiness: PASS على الرأس النهائي لـPR #56.
- Demo data in Production بعد تطبيق 021/022: لا توجد بحسب verification الخاصة بـPR #56.
- Launch Blockers المكتشفة في فحص Day 4: **لا يوجد blocker حقيقي مثبت**.
- المتبقي: operational controlled E2E/config review + branch protection + launch decision، دون إعادة أعمال منجزة.