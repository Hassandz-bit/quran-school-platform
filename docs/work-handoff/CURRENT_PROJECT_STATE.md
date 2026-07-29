# حالة المشروع الحالية

- `main`: `67cd3705effee0303f5b44ed713f4922025d6ea2` بعد دمج PR #34.
- Issue #33 مغلق و`/members` مقبول تشغيليًا.
- النسخة المحمية: `backup/main-67cd370-after-pr34-20260728`.
- migrations 001–014 مطبقة وMigration 014 لا تُعاد.
- Issue #35 على `agent/secure-teacher-invitations`: دعوة معلم موجود فقط بدور `teacher` ونطاق فرعه.
- Migration 015 في PR وغير مطبقة، و`invite-teacher` في PR وغير منشورة.
- لم تُرسل دعوة ولم يُنشأ أو يُعدل Auth user أو Profile أو Membership أو Teacher في الإنتاج.
- `/accept-invite` مستقل عن `/reset-password`، وشرط `PASSWORD_RECOVERY` باقٍ.
- Custom SMTP وSite URL وRedirect allowlist مطلوبة قبل التشغيل.
