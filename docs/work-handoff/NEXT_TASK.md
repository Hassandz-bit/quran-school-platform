# المهمة التالية

- الهدف: إكمال جولة قبول واجهة `/attendance`، وفتح Draft PR مستقل، والتحقق
  من Vercel Preview دون دمجه.
- نقطة البداية: `main` عند
  `efe6cd55b12cc2c7c172a27d0acee5e6669866cb`.
- الفرع: `agent/attendance-interface`.
- راجع التغييرات في:
  - `client/src/App.tsx`
  - `client/src/components/AttendanceRoute.tsx`
  - `client/src/lib/attendance.ts`
  - `client/src/pages/Attendance.tsx`
  - `client/src/pages/Dashboard.tsx`
  - `tests/attendance-interface.test.mjs`
  - `docs/work-handoff/04_ATTENDANCE_INTERFACE.md`
- القيود:
  - `attendance.view` عرض فقط؛ كل كتابة تتطلب `attendance.manage`.
  - المشرف الأكاديمي لا يرى أدوات الكتابة ولا يرسل طلبات كتابة.
  - صفِّ الفروع والحلقات والطلاب ضمن النطاق، واعتمد RLS نهائيًا.
  - لا `select("*")` ولا `service_role` ولا حذف مباشر أو مفاتيح ثابتة.
  - لا Migration جديدة ما لم يظهر نقص أمني مانع.
  - لا تدمج Draft PR.
- شروط التوقف: ظهور نقص أمني يحتاج Migration، أو فشل لا يمكن إصلاحه بأمان.
- الاختبارات:
  - `pnpm install --frozen-lockfile`
  - `pnpm test`
  - `pnpm check`
  - `pnpm build`
  - `git diff --check`
  - Vercel Preview.
