# QuranOS — Launch Handoff

آخر تحديث: 2026-08-10

> هذه الوثيقة هي المصدر التشغيلي الأحدث للاستئناف. إذا تعارضت معها وثيقة أقدم داخل `docs/work-handoff` فهذه الوثيقة هي المعتمدة.

## 1. الحالة الحالية

- المستودع: `Hassandz-bit/quran-school-platform`
- `main` الموثق عند إنشاء هذه الوثيقة: `62abaf8cc9b0ad8fb00f49e8fef2ca6699aa4382`
- آخر PR مدمج: #52 — Consolidated Launch Readiness Gate + Vitest Production isolation.
- Supabase Production project: `dexquxtymmoyfzehjicf`
- Supabase status: `ACTIVE_HEALTHY`
- المنطقة: `eu-west-3`
- لا تعتبر المنصة «مطلقة نهائيًا» بعد؛ المرحلة الحالية Launch Hardening / pre-launch validation.

## 2. ممنوعات تشغيلية مهمة

لا تُعد تطبيق أي Migration من 001 إلى 020 على Production لمجرد أنها موجودة في المستودع. وبصورة خاصة لا تُعد 015–020.

لا ترسل دعوة معلم أو ولي أمر حقيقية، ولا تنشئ Auth user للاختبار، ولا تعدّل حضور/حفظ/مالية حقيقية، إلا بتفويض صريح مستقل.

لا تستخدم `service_role` في المتصفح، ولا توسع RLS للوالدين على الجداول الأساسية، ولا تنشئ `school_membership` لمجرد أن المستخدم ولي أمر.

لا تعتمد role legacy باسم `guardian` كمصدر وصول لبوابة ولي الأمر.

## 3. Production migrations المؤكدة

المigrations الحرجة الأخيرة المطبقة مرة واحدة:

- `20260801074136` — `015_teacher_invitations`
- `20260808092035` — `016_memorization_class_teachers_rpc`
- `20260808214224` — `017_guardian_security_foundation`
- `20260809105742` — `018_guardian_invitations`
- `20260809112918` — `019_guardian_parent_academic_reads`
- `20260809130921` — `020_guardian_parent_finance_reads`

Production وصل حتى Migration 020. لا توجد Migration 021 مطلوبة من العمل الحالي.

## 4. Edge Functions في Production

### invite-teacher

- id: `f4957ed6-403b-424a-bae1-bf745a0b7330`
- version: 1
- status: ACTIVE
- `verify_jwt=true`
- deployed SHA256: `67de6dd9810481a412a0cb97d58169acb3d6fb7b67936f9aee829dfc925e1bbb`

### invite-guardian

- id: `9adc016d-8bc9-4462-a189-4e6512c5e5d8`
- version: 1
- status: ACTIVE
- `verify_jwt=true`
- deployed SHA256: `94a785ad31a609b59112029ab4de453a0d067725ce5d0ba4fdc340076d66de8e`

## 5. Guardian / Parent Portal architecture — Model B+

النموذج المعتمد ثابت:

- Auth account عالمي واحد.
- Profile عالمي واحد.
- وصول ولي الأمر عبر `student_guardians` فقط.
- علاقة ولي الأمر مستقلة عن staff `school_membership`.
- ولي الأمر قد يكون لديه عدة أبناء، وفي عدة مدارس، ولكل طفل علاقة مستقلة قابلة للإلغاء فورًا.
- الموظف وولي الأمر في الحساب نفسه مسموح؛ مسار الموظف هو landing الافتراضي، و`/parent` يبقى متاحًا له إذا لديه علاقة Guardian نشطة.

لا تمنح ولي الأمر صلاحيات staff الأساسية مثل:

- `students.view`
- `attendance.view`
- `memorization.view`
- `finance.view`

قراءات ولي الأمر تتم عبر RPCs محدودة ومصرح بها بعد التحقق من العلاقة النشطة في كل طلب.

صلاحيات إدارة أولياء الأمور:

- `guardians.view`
- `guardians.view_contacts`
- `guardians.link`
- `guardians.invite`
- `guardians.revoke`
- `guardians.audit`

Defaults:

- `school_admin`: الست كلها.
- `registrar`: الكل عدا `guardians.audit`.
- teacher / academic_supervisor / finance_officer: لا شيء افتراضيًا من Guardian permissions.

## 6. Parent RPCs

Academic RPCs من Migration 019:

- `list_my_guardian_students()`
- `get_my_guardian_student_attendance_summary(...)`
- `list_my_guardian_student_attendance(...)`
- `get_my_guardian_student_memorization_summary(...)`
- `list_my_guardian_student_memorization(...)`

Finance RPCs من Migration 020:

- `get_my_guardian_student_finance_summary(...)`
- `list_my_guardian_student_charges(...)`
- `list_my_guardian_student_payments(...)`

كلها صُممت كـ`SECURITY DEFINER` مع `search_path=''`، ولا EXECUTE لـPUBLIC أو anon، ويُسمح لـauthenticated لأن التحقق من العلاقة يتم داخل RPC.

## 7. المسارات المهمة

مصادقة وتوجيه:

- `/`
- `/login`
- `/forgot-password`
- `/reset-password`
- `/post-login`
- `/accept-invite`
- `/accept-guardian-invite`

Staff / school:

- `/dashboard`
- `/students`
- `/teachers`
- `/classes`
- `/members`
- `/attendance`
- `/memorization`
- `/academic-reports`
- `/finance` وما يتبعها من رسوم ومدفوعات ومصروفات وتقارير مالية.

Parent:

- `/parent`
- `/parent/students/:studentId`

## 8. Launch hardening PRs

- #48 — guardian activation success now hands off to `/post-login`.
- #49 — academic reports route aligned with scoped academic access instead of admin-only route.
- #50 — root/login preserve active sessions and route through `/post-login`.
- #51 — successful password recovery routes through `/post-login` instead of `/dashboard`.
- #52 — consolidated Launch Readiness Validation plus Vitest isolation from Production Supabase.

## 9. Launch Readiness Gate

Workflow:

`.github/workflows/launch-readiness-validation.yml`

It validates in one run:

- frozen dependency install
- full app build
- Node tests
- Vitest runtime tests
- TypeScript
- Vite build
- whitespace checks
- Migration tests for teacher invitations, memorization teacher RPC, Guardian foundation, Guardian invitations, parent academic reads, parent finance reads
- both invitation Edge Function test suites

PR #52 was merged only after the full gate and all related workflows passed.

### Test isolation invariant

Vitest must never inherit Production Supabase variables during CI/Vercel builds.

`vitest.config.ts` forces test values pointing to localhost and `tests/test-environment-isolation.test.ts` asserts that the Production project ref is absent.

Reason: before this hardening, Vercel runtime tests produced rejected 400/401 requests against Production using fixture ids such as `school-1`. No Production data was changed, but this was considered unacceptable test isolation. After the fix and a fresh Vercel build, no new such Production requests appeared.

Do not remove this isolation without replacing it with an equally strong mechanism.

## 10. Security verification snapshot

Latest comprehensive pre-launch audit verified:

- no public table without RLS
- no anon write privilege on public tables
- no anon/PUBLIC executable SECURITY DEFINER functions
- no SECURITY DEFINER function in the audited surface missing empty search_path
- no Parent/Guardian RLS widening on core academic/finance tables
- tenant integrity mismatches checked across students/classes/teachers/attendance/memorization/finance/guardian relationships: all 0
- duplicate active memberships: 0
- duplicate role-permission mappings: 0
- legacy guardian permission grants: 0
- legacy guardian active membership assignments: 0

At audit time Production Guardian data counts were all 0: relations, invitations, access events. Do not assume they remain 0 once real onboarding begins.

## 11. Known advisor findings — not all are launch blockers

Supabase Security Advisor currently reports:

- `guardian_invitations` has RLS with no policy: intentional because direct browser table privileges are closed and the workflow is RPC/service-role controlled.
- authenticated-executable SECURITY DEFINER warnings: expected for intentionally browser-callable scoped RPCs; do not revoke mechanically.
- Leaked Password Protection is disabled: recommended security improvement, but enable deliberately after checking plan/UX impact. It can reject known-compromised passwords and may affect existing users.

Performance Advisor reports unindexed FKs, unused indexes, and duplicate permissive SELECT policies on some finance tables. These are performance-maintenance items, not proven launch blockers. Do not drop/add indexes or rewrite policies immediately before launch without workload evidence.

## 12. Repository operational risk

At the latest check, GitHub `main` was not branch-protected and had no enforced required status checks. The current connector did not expose a branch-protection mutation.

Before a wider team or multiple agents start pushing, manually configure branch protection/ruleset so changes go through PRs and important CI checks are required.

## 13. Remaining pre-launch work

Do not rush launch. Recommended order:

1. Keep the consolidated Launch Readiness Gate green on any further code change.
2. Perform controlled E2E smoke with representative Admin and Teacher accounts without mutating unrelated Production data.
3. Guardian E2E requires a real invitation/Auth flow; do it only with explicit authorization and preferably a clearly designated test guardian/student, not arbitrary Production records.
4. Verify password reset from a real email link for at least one authorized test account.
5. Review Vercel Production/Preview environment variables and Supabase Auth Site URL / Redirect allowlist.
6. Decide deliberately on Leaked Password Protection.
7. Configure GitHub branch protection/ruleset.
8. Final visual/mobile polish after functional/security confidence; Google OAuth is deferred and should be added later as a login method, not as open authorization.
9. Only after the above, make a separate launch decision.

## 14. Deferred roadmap

Not required for the current launch-critical core:

- Google login / OAuth
- registration CRM
- documents center
- WhatsApp/SMS/comms
- gamification/evaluations
- teacher performance
- activities/camps/supplies
- QuranOS intelligence / advanced analytics
- detailed visual polish

## 15. Safe resume procedure

When resuming in a new chat/session:

1. Fetch current `main`; never assume the SHA in this snapshot is still latest.
2. Read this file before older work-handoff documents.
3. List Production migrations before applying anything.
4. List Edge Functions before deploying anything.
5. Run/read Launch Readiness Validation before merging launch-related code.
6. Preserve Guardian Model B+ and test-environment isolation.
7. Treat migrations 015–020 as already applied unless Production itself proves otherwise.
8. Never infer authorization from UI visibility alone; RLS/RPC remains the source of security truth.
