# حالة المشروع الحالية

آخر حالة موثقة قبل PR التوثيق الحالي:

- `main`: `62abaf8cc9b0ad8fb00f49e8fef2ca6699aa4382` بعد دمج PR #52.
- Production migrations مطبقة حتى `020_guardian_parent_finance_reads`؛ لا تُعد تطبيق 015–020.
- `invite-teacher` و`invite-guardian` منشورتان في Production بحالة ACTIVE و`verify_jwt=true`.
- Parent Portal core مكتمل: invitation/activation + children + attendance + memorization + finance.
- Guardian authorization يستخدم Model B+ عبر `student_guardians` وليس `school_membership` أو legacy `guardian` role.
- Launch hardening PRs #48–#52 مدمجة.
- Launch Readiness Validation موحد ومثبت أخضر، وVitest معزول عن Supabase Production.
- المنصة ليست معلنة كإطلاق نهائي بعد؛ المتبقي controlled E2E + operational checks + launch decision منفصل.

المصدر التشغيلي الكامل والأحدث:

`docs/work-handoff/LAUNCH_HANDOFF_2026-08-10.md`
