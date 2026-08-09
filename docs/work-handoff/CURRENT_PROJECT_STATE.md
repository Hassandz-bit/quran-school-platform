# حالة المشروع الحالية

آخر **functional baseline** موثق قبل تحديث التوثيق الحالي:

- `main` الوظيفي: `95158f58e53ab208cadc656f772bb5a90accf8bb` بعد دمج PR #54.
- PR #54 أكمل routing/navigation لدور `branch_manager` بما يطابق صلاحياته الفعلية في Production، واجتاز Launch Readiness Gate وVercel.
- Production migrations مطبقة حتى `020_guardian_parent_finance_reads`؛ لا تُعد تطبيق 015–020.
- `invite-teacher` و`invite-guardian` منشورتان في Production بحالة ACTIVE و`verify_jwt=true`.
- Parent Portal core مكتمل: invitation/activation + children + attendance + memorization + finance.
- Guardian authorization يستخدم Model B+ عبر `student_guardians` وليس `school_membership` أو legacy `guardian` role.
- Launch hardening PRs #48–#54 مدمجة، بما فيها Launch Readiness Validation وعزل Vitest عن Supabase Production.
- Vercel Production عند آخر فحص READY، ولم تظهر Runtime Errors مجمعة خلال آخر 7 أيام.
- رابط الويب ما يزال على نطاق Vercel؛ custom web domain قرار branding وليس blocker تقنيًا للحالة الحالية.
- المنصة **ليست معلنة كإطلاق نهائي بعد**؛ المتبقي controlled E2E + Auth/redirect operational checks + branch protection + launch decision منفصل.

مهم: تحديثات التوثيق نفسها تغيّر SHA لـ`main` بعد هذا baseline؛ عند الاستئناف اجلب `main` الفعلي أولًا ولا تعتمد على SHA محفوظ كأنه دائم.

المصدر التشغيلي الكامل:

`docs/work-handoff/LAUNCH_HANDOFF_2026-08-10.md`
