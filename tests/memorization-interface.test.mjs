import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [
  app,
  route,
  page,
  data,
  managerScope,
  dashboard,
  migration,
  teacherRpcMigration,
] = await Promise.all([
  read("client/src/App.tsx"),
  read("client/src/components/MemorizationRoute.tsx"),
  read("client/src/pages/Memorization.tsx"),
  read("client/src/lib/memorization.ts"),
  read("client/src/lib/memorization-manager-scope.ts"),
  read("client/src/pages/Dashboard.tsx"),
  read("supabase/014_memorization_module.sql"),
  read("supabase/016_memorization_class_teachers_rpc.sql"),
]);

const interfaceSources = [app, route, page, data, managerScope, dashboard].join(
  "\n"
);

test("registers a lazy Arabic memorization route", () => {
  assert.match(app, /lazy\(\(\) => import\("\.\/pages\/Memorization"\)\)/);
  assert.match(app, /<Route path="\/memorization">/);
  assert.match(app, /<MemorizationRoute>/);
  assert.match(app, /<MemorizationPageFallback \/>/);
  assert.match(app, /جارٍ تحميل وحدة متابعة الحفظ/);
  assert.match(route, /dir="rtl"/);
  assert.match(page, /dir="rtl"/);
});

test("requires an authenticated school context", () => {
  assert.match(route, /if \(!session\) return <Redirect to="\/login" \/>/);
  assert.match(route, /if \(!school \|\| authorizationError\)/);
  assert.match(route, /جارٍ التحقق من صلاحيات متابعة الحفظ/);
});

test("models view and manage as separate capabilities", () => {
  assert.match(data, /"memorization\.view"/);
  assert.match(data, /"memorization\.manage"/);
  assert.match(data, /canView: boolean/);
  assert.match(data, /canManage: boolean/);
  assert.match(page, /canManageSelectedClass/);
});

test("keeps the academic supervisor view-only", () => {
  assert.match(migration, /\('academic_supervisor', 'memorization\.view'\)/);
  assert.doesNotMatch(
    migration,
    /\('academic_supervisor', 'memorization\.manage'\)/
  );
  assert.match(page, /وضع العرض فقط/);
  assert.match(page, /لا\s+تُرسل الصفحة أي عملية إنشاء أو تعديل/);
});

test("checks manage permission before every write", () => {
  const saveStart = data.indexOf("export async function saveMemorizationRecord");
  const permissionCheck = data.indexOf('"memorization.manage"', saveStart);
  const updateWrite = data.indexOf('.from("memorization_records")', permissionCheck);
  const insertWrite = data.lastIndexOf('.from("memorization_records")');

  assert.ok(saveStart >= 0);
  assert.ok(permissionCheck > saveStart);
  assert.ok(updateWrite > permissionCheck);
  assert.ok(insertWrite > permissionCheck);
  assert.match(data, /if \(!allowed\) throw new MemorizationPermissionError\(\)/);
});

test("filters branches and classes to the memorization scope", () => {
  assert.match(data, /hasSchoolPermission/);
  assert.match(data, /hasBranchPermission/);
  assert.match(data, /canAccessMemorizationClass/);
  assert.match(data, /allowedClassIds/);
  assert.match(data, /allowedBranchIds/);
  assert.match(data, /\.in\("id", allowedClassIds\)/);
  assert.match(page, /scope\.branches\.map/);
  assert.match(page, /availableClasses\.map/);
});

test("loads only active students in the exact class scope", () => {
  assert.match(
    data,
    /\.from\("students"\)[\s\S]*?\.select\("id, first_name, last_name"\)[\s\S]*?\.eq\("school_id", schoolId\)[\s\S]*?\.eq\("branch_id", branchId\)[\s\S]*?\.eq\("class_id", classId\)[\s\S]*?\.eq\("status", "active"\)/
  );
});

test("loads only active teachers assigned to the class through a scoped RPC", () => {
  assert.match(
    data,
    /client\.rpc\(\s*"list_memorization_class_teachers"[\s\S]*?target_school_id: schoolId[\s\S]*?target_branch_id: branchId[\s\S]*?target_class_id: classId/
  );
  assert.match(
    teacherRpcMigration,
    /create or replace function public\.list_memorization_class_teachers/i
  );
  assert.match(teacherRpcMigration, /join public\.class_teachers/i);
  assert.match(teacherRpcMigration, /join public\.teachers/i);
  assert.match(teacherRpcMigration, /class_teacher\.status = 'active'/i);
  assert.match(teacherRpcMigration, /teacher\.status = 'active'/i);
  assert.doesNotMatch(
    data,
    /\.from\("class_teachers"\)[\s\S]*?\.select\("teacher_id"\)/
  );
  assert.doesNotMatch(
    data,
    /\.from\("teachers"\)[\s\S]*?\.select\("id, profile_id, first_name, last_name"\)/
  );
  assert.match(page, /تم ربط السجل بحساب المعلم الحالي تلقائيًا/);
});

test("keeps teacher-only accounts scoped while managers use their exact branch assignment", () => {
  assert.match(
    managerScope,
    /\.from\("membership_roles"\)[\s\S]*?\.select\("role_id, branch_id"\)[\s\S]*?\.eq\("school_id", schoolId\)[\s\S]*?\.eq\("membership_id", membershipId\)[\s\S]*?\.in\("role_id", branchManagerRoleIds\)/
  );
  assert.match(page, /role\.code === "branch_manager"/);
  assert.match(
    page,
    /isSchoolAdmin \|\|\s+managerScope\.schoolWide \|\|\s+managerScope\.branchIds\.includes\(branchId\)/
  );
  assert.match(
    page,
    /const teacherRestrictedToOwnRecords =\s+currentTeacherId !== null && !canChooseAssignedTeacher/
  );
  assert.match(
    page,
    /teacherRestrictedToOwnRecords && record\.teacherId !== currentTeacherId/
  );
  assert.match(
    page,
    /!teacherRestrictedToOwnRecords \|\|\s+record\.teacherId === currentTeacherId/
  );
});

test("keeps the record teacher immutable during updates", () => {
  assert.match(
    page,
    /const teacherSelectionDisabled =\s+teacherRestrictedToOwnRecords \|\| Boolean\(draft\.recordId\)/
  );
  assert.match(page, /disabled=\{teacherSelectionDisabled\}/);
  assert.match(page, /معلم السجل ثابت بعد الإنشاء ولا يمكن تغييره أثناء التعديل/);
});

test("retries workspace loading with an explicit reload token", () => {
  assert.match(
    page,
    /const \[workspaceReload, setWorkspaceReload\] = useState\(0\)/
  );
  assert.match(page, /setWorkspaceReload\(current => current \+ 1\)/);
  assert.match(page, /workspaceReload,/);
});

test("supports the four memorization session types", () => {
  for (const [value, label] of [
    ["new_memorization", "حفظ جديد"],
    ["near_revision", "مراجعة قريبة"],
    ["distant_revision", "مراجعة بعيدة"],
    ["assessment", "اختبار"],
  ]) {
    assert.match(data, new RegExp(`"${value}"`));
    assert.match(data, new RegExp(label));
  }
});

test("contains all 114 surahs and exact boundary examples", () => {
  assert.match(data, /const SURAH_NAMES = \[/);
  assert.match(data, /const SURAH_AYAH_COUNTS = \[/);
  assert.match(data, /"الفاتحة"/);
  assert.match(data, /"البقرة"/);
  assert.match(data, /"الكوثر"/);
  assert.match(data, /"الناس"/);
  assert.match(migration, /array\[7, 286,[\s\S]*?, 3, 5, 4, 5, 6\]/);
  assert.match(page, /selectedSurah\.ayahCount/);
  assert.match(page, /max=\{selectedSurah\.ayahCount\}/);
});

test("validates the ayah range rating errors and text limits", () => {
  assert.match(data, /draft\.ayahEnd > surah\.ayahCount/);
  assert.match(data, /draft\.ayahEnd < draft\.ayahStart/);
  assert.match(data, /draft\.rating < 1/);
  assert.match(data, /draft\.rating > 5/);
  assert.match(data, /draft\.errorsCount > 100/);
  assert.match(data, /draft\.notes\.trim\(\)\.length > 1000/);
  assert.match(data, /draft\.nextAssignment\.trim\(\)\.length > 1000/);
});

test("verifies the active student and assigned teacher before saving", () => {
  assert.match(data, /async function verifyStudent/);
  assert.match(data, /async function verifyTeacherAssignment/);
  assert.match(data, /\.eq\("student_id", input\.studentId\)/);
  assert.match(data, /await listMemorizationClassTeachers/);
  assert.match(data, /teacher\.id === input\.draft\.teacherId/);
  assert.match(data, /await Promise\.all\(\[[\s\S]*?verifyStudent[\s\S]*?verifyTeacherAssignment/);
});

test("inserts only allowed identity and editable columns", () => {
  assert.match(
    data,
    /\.insert\(\{[\s\S]*?class_id: input\.classId,[\s\S]*?student_id: input\.studentId,[\s\S]*?teacher_id: input\.draft\.teacherId,[\s\S]*?\.\.\.normalizedWritePayload/
  );
  assert.doesNotMatch(data, /school_id: input\.schoolId/);
  assert.doesNotMatch(data, /recorded_by:/);
  assert.doesNotMatch(data, /last_modified_by:/);
});

test("updates editable fields without changing identity", () => {
  assert.match(data, /\.update\(normalizedWritePayload\(input\.draft\)\)/);
  assert.match(data, /\.eq\("id", input\.draft\.recordId\)/);
  assert.match(data, /\.eq\("student_id", input\.studentId\)/);
  assert.match(migration, /MEMORIZATION_IDENTITY_FIELDS_IMMUTABLE/);
});

test("loads filtered and full previous student history", () => {
  assert.match(data, /fetchStudentMemorizationRecords/);
  assert.match(data, /if \(recordDate\) query = query\.eq\("record_date", recordDate\)/);
  assert.match(data, /\.limit\(20\)/);
  assert.match(page, /عرض كل السجل السابق/);
  assert.match(page, /آخر 20 سجلًا عبر جميع التواريخ/);
});

test("loads append-only audit history", () => {
  assert.match(data, /fetchMemorizationAudit/);
  assert.match(data, /\.from\("memorization_record_history"\)/);
  assert.match(data, /\.eq\("memorization_record_id", recordId\)/);
  assert.match(page, /سجل التدقيق/);
  assert.match(page, /getChangedLabels/);
  assert.doesNotMatch(data, /memorization_record_history"\)\s*\.insert/);
});

test("does not render editing controls for view-only records", () => {
  assert.match(page, /\{canManageSelectedClass && workspace\.teachers\.length > 0 && \(/);
  assert.match(page, /const canEdit =\s+canManageSelectedClass/);
  assert.match(page, /\{canEdit && \(/);
  assert.match(page, /!canManageSelectedClass/);
});

test("returns the saved record id for create and update operations", () => {
  assert.match(
    data,
    /return \{ recordId: data\.id as string, mode: "updated" \};/
  );
  assert.match(
    data,
    /return \{ recordId: data\.id as string, mode: "created" \};/
  );
});

test("keeps the saved draft in edit mode instead of resetting after save", () => {
  const saveBlock = page.slice(
    page.indexOf("const handleSave"),
    page.indexOf("const handleAuditToggle")
  );

  assert.match(saveBlock, /recordId:\s*result\.recordId/);
  assert.match(saveBlock, /notes:\s*current\.notes\.trim\(\)/);
  assert.match(
    saveBlock,
    /nextAssignment:\s*current\.nextAssignment\.trim\(\)/
  );
  assert.doesNotMatch(saveBlock, /createMemorizationDraft/);
  assert.match(
    saveBlock,
    /تم حفظ السجل، وأصبح النموذج في وضع التعديل/
  );
  assert.match(
    data,
    /if \(input\.draft\.recordId\)[\s\S]*?\.update\(normalizedWritePayload\(input\.draft\)\)[\s\S]*?\.eq\("id", input\.draft\.recordId\)/
  );
});

test("uses the explicit new-record action as the edit-mode exit", () => {
  const newRecordBlock = page.slice(
    page.indexOf("const handleNewRecord"),
    page.indexOf("const handleEditRecord")
  );

  assert.match(
    newRecordBlock,
    /setDraft\(createMemorizationDraft\(recordDate, defaultTeacherId\)\)/
  );
  assert.match(page, /onClick=\{handleNewRecord\}/);
  assert.match(page, /وضع التعديل/);
  assert.match(page, /الحفظ القادم سيعدّل السجل الحالي/);
  assert.match(
    page,
    /\{draft\.recordId \? "حفظ التعديل" : "حفظ المتابعة"\}/
  );
});

test("covers loading error empty forbidden and success states", () => {
  for (const text of [
    "جارٍ تحميل نطاق متابعة الحفظ",
    "تعذر تحميل متابعة الحفظ",
    "لا توجد صلاحية لعرض متابعة الحفظ",
    "لا توجد فروع متاحة",
    "لا توجد حلقات متاحة",
    "جارٍ تحميل طلاب الحلقة",
    "لا يوجد طلاب في الحلقة",
    "لا توجد سجلات متابعة",
    "تم حفظ السجل، وأصبح النموذج في وضع التعديل",
  ]) {
    assert.match(page, new RegExp(text));
  }
  assert.match(page, /role="alert"/);
  assert.match(page, /role="status"/);
});

test("is mobile-first RTL with a sticky save bar", () => {
  assert.match(page, /dir="rtl"/);
  assert.match(page, /sm:grid-cols-2/);
  assert.match(page, /lg:grid-cols-4/);
  assert.match(page, /grid-cols-5/);
  assert.match(page, /fixed inset-x-0 bottom-\[calc\(5rem\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(page, /min-h-11/);
});

test("relies on AppShell instead of rendering a second memorization header", () => {
  assert.doesNotMatch(page, /متابعة الحفظ والمراجعة/);
  assert.doesNotMatch(page, /aria-label="العودة إلى لوحة التحكم"/);
  assert.doesNotMatch(page, /aria-label="تسجيل الخروج"/);
});


test("links memorization from the dashboard", () => {
  assert.match(dashboard, /path: "\/memorization"/);
});

test("contains no forbidden browser data-access patterns", () => {
  assert.equal(interfaceSources.includes('.select("*")'), false);
  assert.equal(interfaceSources.includes("service_role"), false);
  assert.equal(interfaceSources.includes(".delete("), false);
  assert.equal(interfaceSources.includes("SUPABASE_SERVICE"), false);
  assert.equal(interfaceSources.includes('.from("class_teachers")'), false);
  assert.equal(interfaceSources.includes('.from("teachers")'), false);
});
