from __future__ import annotations

import os
import sys
from pathlib import Path


def replace_once(content: str, old: str, new: str, label: str) -> str:
    if old not in content:
        raise SystemExit(f"Expected {label} was not found")
    return content.replace(old, new, 1)


def apply_patch() -> None:
    page_path = Path("client/src/pages/Memorization.tsx")
    page = page_path.read_text(encoding="utf-8")

    old_save = '''      const message =
        result.mode === "created"
          ? "تم حفظ متابعة الطالب بنجاح."
          : "تم تحديث سجل المتابعة بنجاح.";
      setSaveSuccess(message);
      toast.success(message);
      setRecordsReload(current => current + 1);
      const defaultTeacherId =
        currentTeacherId ?? workspace?.teachers[0]?.id ?? "";
      setDraft(createMemorizationDraft(recordDate, defaultTeacherId));
      setDirty(false);'''

    new_save = '''      const message =
        result.mode === "created"
          ? "تم حفظ السجل، وأصبح النموذج في وضع التعديل. اضغط «سجل جديد» لإضافة متابعة أخرى."
          : "تم تحديث سجل المتابعة بنجاح.";
      setDraft(current => ({
        ...current,
        recordId: result.recordId,
        notes: current.notes.trim(),
        nextAssignment: current.nextAssignment.trim(),
      }));
      setDirty(false);
      setSaveSuccess(message);
      toast.success(message);
      setRecordsReload(current => current + 1);'''

    page = replace_once(page, old_save, new_save, "handleSave reset block")

    old_heading = '''                    <h2 className="flex items-center gap-2 font-bold text-[#2C3E50]">
                      <BookOpenCheck size={20} className="text-[#0B4738]" />
                      {draft.recordId ? "تعديل سجل المتابعة" : "تسجيل متابعة جديدة"}
                    </h2>
                    <p className="mt-1 text-xs text-gray-500">
                      الطالب: {selectedStudent?.fullName ?? "غير محدد"}
                    </p>'''

    new_heading = '''                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="flex items-center gap-2 font-bold text-[#2C3E50]">
                        <BookOpenCheck size={20} className="text-[#0B4738]" />
                        {draft.recordId ? "تعديل سجل المتابعة" : "تسجيل متابعة جديدة"}
                      </h2>
                      {draft.recordId && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">
                          وضع التعديل · {draft.recordId.slice(0, 8)}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      الطالب: {selectedStudent?.fullName ?? "غير محدد"}
                    </p>
                    {draft.recordId && (
                      <p className="mt-2 text-xs font-medium text-amber-800">
                        الحفظ القادم سيعدّل السجل الحالي. استخدم «سجل جديد» لإضافة متابعة أخرى.
                      </p>
                    )}'''

    page = replace_once(page, old_heading, new_heading, "memorization form heading")
    page_path.write_text(page, encoding="utf-8")

    test_path = Path("tests/memorization-interface.test.mjs")
    tests = test_path.read_text(encoding="utf-8")
    tests = replace_once(
        tests,
        '    "تم حفظ متابعة الطالب بنجاح",',
        '    "تم حفظ السجل، وأصبح النموذج في وضع التعديل",',
        "success-state expectation",
    )

    marker = 'test("covers loading error empty forbidden and success states", () => {'
    additions = '''test("returns the saved record id for create and update operations", () => {
  assert.match(
    data,
    /return \\{ recordId: data\\.id as string, mode: "updated" \\};/
  );
  assert.match(
    data,
    /return \\{ recordId: data\\.id as string, mode: "created" \\};/
  );
});

test("keeps the saved draft in edit mode instead of resetting after save", () => {
  const saveBlock = page.slice(
    page.indexOf("const handleSave"),
    page.indexOf("const handleAuditToggle")
  );

  assert.match(saveBlock, /recordId:\\s*result\\.recordId/);
  assert.match(saveBlock, /notes:\\s*current\\.notes\\.trim\\(\\)/);
  assert.match(
    saveBlock,
    /nextAssignment:\\s*current\\.nextAssignment\\.trim\\(\\)/
  );
  assert.doesNotMatch(saveBlock, /createMemorizationDraft/);
  assert.match(
    saveBlock,
    /تم حفظ السجل، وأصبح النموذج في وضع التعديل/
  );
  assert.match(
    data,
    /if \\(input\\.draft\\.recordId\\)[\\s\\S]*?\\.update\\(normalizedWritePayload\\(input\\.draft\\)\\)[\\s\\S]*?\\.eq\\("id", input\\.draft\\.recordId\\)/
  );
});

test("uses the explicit new-record action as the edit-mode exit", () => {
  const newRecordBlock = page.slice(
    page.indexOf("const handleNewRecord"),
    page.indexOf("const handleEditRecord")
  );

  assert.match(
    newRecordBlock,
    /setDraft\\(createMemorizationDraft\\(recordDate, defaultTeacherId\\)\\)/
  );
  assert.match(page, /onClick=\\{handleNewRecord\\}/);
  assert.match(page, /وضع التعديل/);
  assert.match(page, /الحفظ القادم سيعدّل السجل الحالي/);
  assert.match(
    page,
    /\\{draft\\.recordId \\? "حفظ التعديل" : "حفظ المتابعة"\\}/
  );
});

'''
    tests = replace_once(tests, marker, additions + marker, "test insertion marker")
    test_path.write_text(tests, encoding="utf-8")


def append_section(path_string: str, marker: str, section: str) -> None:
    path = Path(path_string)
    content = path.read_text(encoding="utf-8")
    if marker not in content:
        path.write_text(content.rstrip() + "\n\n" + section.strip() + "\n", encoding="utf-8")


def update_docs() -> None:
    fix_sha = os.environ["FIX_SHA"]

    append_section(
        "docs/work-handoff/CURRENT_PROJECT_STATE.md",
        "Issue #29 — إصلاح بقاء نموذج الحفظ",
        f'''
## Issue #29 — إصلاح بقاء نموذج الحفظ في وضع التعديل

- الفرع: `agent/fix-memorization-edit-mode`.
- Base SHA: `acd61bdf79ebc196e35d736f1a786a1c7aae5e39`.
- Head التنفيذي المختبر: `{fix_sha}`.
- السبب الجذري: `handleSave` كان يستدعي `createMemorizationDraft` بعد نجاح الحفظ، فيمسح `recordId` ويحوّل الحفظ التالي إلى INSERT جديد.
- الإصلاح: الاحتفاظ بـ`result.recordId` والقيم المحفوظة، وإبقاء النموذج في وضع التعديل بعد الإنشاء والتحديث.
- أضيفت شارة `وضع التعديل` وتنبيه بأن الحفظ التالي سيعدّل السجل الحالي.
- الاختبارات: `198/198` للمشروع، `27/27` لواجهة الحفظ، و`14/14` لقاعدة الحفظ.
- TypeScript وبناء Vite و`git diff --check`: ناجحة.
- Vercel على Head التنفيذي المختبر: Success.
- لم يُشغّل SQL، ولم تتغير Supabase أو migrations، ولم تُحذف أو تُعدّل سجلات الاختبار الحالية.
- لم يُمس أي فرع تحت `backup/*`.
''',
    )

    append_section(
        "docs/work-handoff/NEXT_TASK.md",
        "المهمة التالية بعد دمج إصلاح Issue #29",
        '''
## المهمة التالية بعد دمج إصلاح Issue #29

- تنفيذ اختبار UPDATE حقيقي على أحد سجلات الحفظ الحالية من الواجهة.
- التأكد أن الحفظ الثاني يعدّل السجل نفسه ولا ينشئ سجلًا جديدًا.
- التحقق من ظهور حركة `update` في `memorization_record_history`.
- لا تحذف سجلات الاختبار الحالية، ولا تشغّل SQL، ولا تعِد Migration 014.
''',
    )

    append_section(
        "docs/work-handoff/RESUME_IN_NEW_WORK_CHAT.md",
        "إصلاح Issue #29 الجاري",
        f'''
## إصلاح Issue #29 الجاري

- Draft branch: `agent/fix-memorization-edit-mode`.
- Base SHA: `acd61bdf79ebc196e35d736f1a786a1c7aae5e39`.
- Head التنفيذي المختبر: `{fix_sha}`.
- النموذج يبقى مرتبطًا بـ`result.recordId` بعد الإنشاء أو التحديث.
- لا يبدأ سجل جديد إلا من زر `سجل جديد` داخل سياق النموذج الحالي.
- نتائج التحقق: `198/198`، وواجهة الحفظ `27/27`، وقاعدة الحفظ `14/14`، وTypeScript والبناء و`git diff --check` ناجحة.
- Vercel على Head التنفيذي المختبر: Success.
- بعد الدمج: اختبر UPDATE حقيقيًا وتحقق من حركة تدقيق `update`.
''',
    )

    append_section(
        "docs/work-handoff/06_MEMORIZATION_INTERFACE.md",
        "إصلاح Issue #29 — وضع التعديل بعد الحفظ",
        f'''
## إصلاح Issue #29 — وضع التعديل بعد الحفظ

- Base SHA: `acd61bdf79ebc196e35d736f1a786a1c7aae5e39`.
- Head التنفيذي المختبر: `{fix_sha}`.
- بعد إنشاء سجل جديد تحتفظ الواجهة بـ`result.recordId` وتعرض `تعديل سجل المتابعة` و`حفظ التعديل`.
- بعد التحديث يبقى السجل نفسه محمّلًا.
- زر `سجل جديد` هو الإجراء الصريح لبدء سجل آخر.
- أضيف تنبيه ثابت وشارة مختصرة لمعرف السجل في وضع التعديل.
- لا تغيير في طبقة قاعدة البيانات أو Migration 014.
''',
    )

    append_section(
        "docs/work-handoff/CHANGELOG_WORK.md",
        "2026-07-28 — إصلاح Issue #29",
        f'''
## 2026-07-28 — إصلاح Issue #29

- عولج رجوع نموذج متابعة الحفظ تلقائيًا إلى وضع الإنشاء بعد الحفظ.
- أصبح `result.recordId` محفوظًا في الـdraft بعد INSERT وUPDATE.
- أضيفت شارة وضع التعديل وتنبيه يمنع الالتباس وإنشاء سجل مكرر.
- أضيفت 3 اختبارات انحدار؛ النتائج التنفيذية: `198/198` و`27/27` و`14/14`.
- Head التنفيذي المختبر: `{fix_sha}`، وVercel عليه Success.
- لا SQL ولا Supabase ولا Migration ولا حذف أو تعديل لسجلات الاختبار الحالية.
''',
    )


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in {"patch", "docs"}:
        raise SystemExit("Usage: apply_issue_29_fix.py patch|docs")
    if sys.argv[1] == "patch":
        apply_patch()
    else:
        update_docs()


if __name__ == "__main__":
    main()
