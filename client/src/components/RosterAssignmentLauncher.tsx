import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpenCheck, Link2, RefreshCw, UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import {
  deactivateClassTeacherAssignment,
  fetchActiveClassesForBranches,
  fetchAssignableStudents,
  fetchClassTeacherRoster,
  fetchManageableRosterBranches,
  getRosterErrorMessage,
  saveClassTeacherAssignment,
  updateStudentClassAssignment,
  type ClassTeacherAssignment,
  type ClassTeacherAssignmentRole,
  type ClassTeacherRoster,
  type RosterBranch,
  type RosterClass,
  type RosterStudent,
} from "@/lib/class-roster";
import { toast } from "sonner";

type RosterAssignmentMode = "student-class" | "class-teacher";

type RosterAssignmentLauncherProps = {
  mode: RosterAssignmentMode;
};

const roleLabels: Record<ClassTeacherAssignmentRole, string> = {
  primary: "معلم أساسي",
  assistant: "معلم مساعد",
};

function LoadingCard({ label }: { label: string }) {
  return (
    <Card className="border border-gray-100 p-8 text-center text-sm text-gray-500">
      <RefreshCw className="mx-auto mb-3 animate-spin" size={22} />
      {label}
    </Card>
  );
}

function EmptyCard({ label }: { label: string }) {
  return (
    <Card className="border border-gray-100 p-6 text-center text-sm text-gray-500">
      {label}
    </Card>
  );
}

function StudentClassManager({
  schoolId,
  branches,
  onClose,
}: {
  schoolId: string;
  branches: RosterBranch[];
  onClose: () => void;
}) {
  const branchIds = useMemo(() => branches.map(branch => branch.id), [branches]);
  const branchNames = useMemo(
    () => new Map(branches.map(branch => [branch.id, branch.name])),
    [branches]
  );
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [classes, setClasses] = useState<RosterClass[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");

    try {
      const [studentRows, classRows] = await Promise.all([
        fetchAssignableStudents(schoolId, branchIds),
        fetchActiveClassesForBranches(schoolId, branchIds),
      ]);
      setStudents(studentRows);
      setClasses(classRows);
      setSelectedStudentId(current => {
        if (current && studentRows.some(student => student.id === current)) {
          return current;
        }
        return studentRows[0]?.id ?? "";
      });
    } catch (error) {
      setLoadError(getRosterErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [branchIds, schoolId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedStudent = useMemo(
    () => students.find(student => student.id === selectedStudentId) ?? null,
    [selectedStudentId, students]
  );
  const eligibleClasses = useMemo(
    () =>
      selectedStudent
        ? classes.filter(classItem => classItem.branchId === selectedStudent.branchId)
        : [],
    [classes, selectedStudent]
  );

  useEffect(() => {
    if (!selectedStudent) {
      setSelectedClassId("");
      return;
    }

    const currentClassIsEligible = eligibleClasses.some(
      classItem => classItem.id === selectedStudent.classId
    );
    setSelectedClassId(
      currentClassIsEligible && selectedStudent.classId ? selectedStudent.classId : ""
    );
  }, [eligibleClasses, selectedStudent]);

  const save = async () => {
    if (!selectedStudent) return;

    setIsSaving(true);
    try {
      const classId = selectedClassId || null;
      await updateStudentClassAssignment({
        schoolId,
        branchId: selectedStudent.branchId,
        studentId: selectedStudent.id,
        studentStatus: selectedStudent.status,
        classId,
      });
      setStudents(current =>
        current.map(student =>
          student.id === selectedStudent.id ? { ...student, classId } : student
        )
      );
      toast.success(classId ? "تم ربط الطالب بالحلقة." : "تمت إزالة تعيين الحلقة عن الطالب.");
    } catch (error) {
      toast.error(getRosterErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <DialogHeader className="text-right sm:text-right">
        <DialogTitle className="flex items-center gap-2 text-[#2C3E50]">
          <Link2 size={20} className="text-[#0B4738]" />
          ربط الطالب بالحلقة
        </DialogTitle>
        <DialogDescription className="leading-6 text-right">
          اختر طالبًا نشطًا ثم عيّن له حلقة نشطة من فرعه نفسه، أو اتركه دون حلقة.
        </DialogDescription>
      </DialogHeader>

      {isLoading ? (
        <LoadingCard label="جارٍ تحميل الطلاب والحلقات..." />
      ) : loadError ? (
        <Card className="border border-red-100 p-5 text-center" role="alert">
          <p className="text-sm text-red-700">{loadError}</p>
          <Button className="mt-4" variant="outline" onClick={() => void load()}>
            <RefreshCw size={16} />
            إعادة المحاولة
          </Button>
        </Card>
      ) : students.length === 0 ? (
        <EmptyCard label="لا يوجد طلاب نشطون داخل الفروع التي تملك صلاحية إدارتها." />
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="roster-student" className="text-sm font-medium text-[#2C3E50]">
              الطالب
            </label>
            <select
              id="roster-student"
              value={selectedStudentId}
              onChange={event => setSelectedStudentId(event.target.value)}
              className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-[#2C3E50]"
            >
              {students.map(student => (
                <option key={student.id} value={student.id}>
                  {student.fullName}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm">
            <span className="text-gray-500">الفرع الحالي: </span>
            <strong className="text-[#2C3E50]">
              {selectedStudent
                ? (branchNames.get(selectedStudent.branchId) ?? "غير متاح")
                : "—"}
            </strong>
          </div>

          <div className="space-y-2">
            <label htmlFor="roster-student-class" className="text-sm font-medium text-[#2C3E50]">
              الحلقة
            </label>
            <select
              id="roster-student-class"
              value={selectedClassId}
              onChange={event => setSelectedClassId(event.target.value)}
              className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-[#2C3E50]"
            >
              <option value="">دون حلقة</option>
              {eligibleClasses.map(classItem => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name}
                  {classItem.scheduleLabel ? ` — ${classItem.scheduleLabel}` : ""}
                </option>
              ))}
            </select>
            <p className="text-xs leading-5 text-gray-500">
              لا تظهر إلا الحلقات النشطة التابعة لمدرسة الطالب وفرعه الحاليين.
            </p>
          </div>
        </div>
      )}

      <DialogFooter className="sm:justify-start">
        <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
          إغلاق
        </Button>
        <Button
          type="button"
          onClick={() => void save()}
          disabled={isLoading || isSaving || !selectedStudent}
          className="bg-[#0B4738] text-white hover:bg-[#08382d]"
        >
          {isSaving ? "جارٍ الحفظ..." : "حفظ التعيين"}
        </Button>
      </DialogFooter>
    </>
  );
}

function TeacherAssignmentManager({
  schoolId,
  branches,
  onClose,
}: {
  schoolId: string;
  branches: RosterBranch[];
  onClose: () => void;
}) {
  const branchIds = useMemo(() => branches.map(branch => branch.id), [branches]);
  const branchNames = useMemo(
    () => new Map(branches.map(branch => [branch.id, branch.name])),
    [branches]
  );
  const [classes, setClasses] = useState<RosterClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [roster, setRoster] = useState<ClassTeacherRoster>({
    teachers: [],
    assignments: [],
  });
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [selectedRole, setSelectedRole] =
    useState<ClassTeacherAssignmentRole>("assistant");
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [isLoadingRoster, setIsLoadingRoster] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState("");
  const [loadError, setLoadError] = useState("");

  const loadClasses = useCallback(async () => {
    setIsLoadingClasses(true);
    setLoadError("");

    try {
      const classRows = await fetchActiveClassesForBranches(schoolId, branchIds);
      setClasses(classRows);
      setSelectedClassId(current => {
        if (current && classRows.some(classItem => classItem.id === current)) {
          return current;
        }
        return classRows[0]?.id ?? "";
      });
    } catch (error) {
      setLoadError(getRosterErrorMessage(error));
    } finally {
      setIsLoadingClasses(false);
    }
  }, [branchIds, schoolId]);

  useEffect(() => {
    void loadClasses();
  }, [loadClasses]);

  const selectedClass = useMemo(
    () => classes.find(classItem => classItem.id === selectedClassId) ?? null,
    [classes, selectedClassId]
  );

  const loadRoster = useCallback(async () => {
    if (!selectedClass) {
      setRoster({ teachers: [], assignments: [] });
      setSelectedTeacherId("");
      return;
    }

    setIsLoadingRoster(true);
    setLoadError("");
    try {
      const nextRoster = await fetchClassTeacherRoster(
        schoolId,
        selectedClass.branchId,
        selectedClass.id
      );
      setRoster(nextRoster);
      setSelectedTeacherId(current => {
        if (current && nextRoster.teachers.some(teacher => teacher.id === current)) {
          return current;
        }
        return nextRoster.teachers[0]?.id ?? "";
      });
    } catch (error) {
      setRoster({ teachers: [], assignments: [] });
      setSelectedTeacherId("");
      setLoadError(getRosterErrorMessage(error));
    } finally {
      setIsLoadingRoster(false);
    }
  }, [schoolId, selectedClass]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  const chooseAssignment = (assignment: ClassTeacherAssignment) => {
    const teacherIsActive = roster.teachers.some(
      teacher => teacher.id === assignment.teacherId
    );
    if (!teacherIsActive) {
      toast.error("لا يمكن تعديل هذا التعيين لأن المعلم غير نشط حاليًا.");
      return;
    }
    setSelectedTeacherId(assignment.teacherId);
    setSelectedRole(assignment.assignmentRole);
  };

  const save = async () => {
    if (!selectedClass || !selectedTeacherId) return;

    setIsSaving(true);
    try {
      await saveClassTeacherAssignment({
        schoolId,
        branchId: selectedClass.branchId,
        classId: selectedClass.id,
        teacherId: selectedTeacherId,
        assignmentRole: selectedRole,
      });
      toast.success("تم حفظ تعيين المعلم للحلقة.");
      await loadRoster();
    } catch (error) {
      toast.error(getRosterErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const deactivate = async (assignment: ClassTeacherAssignment) => {
    setDeactivatingId(assignment.id);
    try {
      await deactivateClassTeacherAssignment(assignment);
      toast.success("تم إلغاء التعيين دون حذف السجل.");
      await loadRoster();
    } catch (error) {
      toast.error(getRosterErrorMessage(error));
    } finally {
      setDeactivatingId("");
    }
  };

  const activeAssignments = roster.assignments.filter(
    assignment => assignment.status === "active"
  );
  const inactiveAssignments = roster.assignments.filter(
    assignment => assignment.status === "inactive"
  );

  const renderAssignment = (assignment: ClassTeacherAssignment) => (
    <Card key={assignment.id} className="border border-gray-100 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-[#2C3E50]">{assignment.teacherName}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-[#0B4738]/10 px-2.5 py-1 text-[#0B4738]">
              {roleLabels[assignment.assignmentRole]}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 ${
                assignment.status === "active"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {assignment.status === "active" ? "نشط" : "غير نشط"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => chooseAssignment(assignment)}>
            {assignment.status === "active" ? "تعديل الدور" : "إعادة تفعيل"}
          </Button>
          {assignment.status === "active" && (
            <Button
              type="button"
              variant="outline"
              className="border-red-200 text-red-700 hover:bg-red-50"
              disabled={deactivatingId === assignment.id}
              onClick={() => void deactivate(assignment)}
            >
              <UserMinus size={16} />
              {deactivatingId === assignment.id ? "جارٍ الإلغاء..." : "إلغاء التعيين"}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );

  return (
    <>
      <DialogHeader className="text-right sm:text-right">
        <DialogTitle className="flex items-center gap-2 text-[#2C3E50]">
          <BookOpenCheck size={20} className="text-[#0B4738]" />
          تعيين المعلمين للحلقات
        </DialogTitle>
        <DialogDescription className="leading-6 text-right">
          أضف معلمًا أساسيًا أو مساعدًا، غيّر دوره، أو عطّل التعيين دون حذف السجل.
        </DialogDescription>
      </DialogHeader>

      {isLoadingClasses ? (
        <LoadingCard label="جارٍ تحميل الحلقات..." />
      ) : loadError && classes.length === 0 ? (
        <Card className="border border-red-100 p-5 text-center" role="alert">
          <p className="text-sm text-red-700">{loadError}</p>
          <Button className="mt-4" variant="outline" onClick={() => void loadClasses()}>
            <RefreshCw size={16} />
            إعادة المحاولة
          </Button>
        </Card>
      ) : classes.length === 0 ? (
        <EmptyCard label="لا توجد حلقات نشطة داخل الفروع التي تملك صلاحية إدارتها." />
      ) : (
        <div className="max-h-[65vh] space-y-5 overflow-y-auto pe-1">
          <div className="space-y-2">
            <label htmlFor="roster-class" className="text-sm font-medium text-[#2C3E50]">
              الحلقة
            </label>
            <select
              id="roster-class"
              value={selectedClassId}
              onChange={event => setSelectedClassId(event.target.value)}
              className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-[#2C3E50]"
            >
              {classes.map(classItem => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name} — {branchNames.get(classItem.branchId) ?? "فرع غير متاح"}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm">
            <span className="text-gray-500">فرع الحلقة: </span>
            <strong className="text-[#2C3E50]">
              {selectedClass
                ? (branchNames.get(selectedClass.branchId) ?? "غير متاح")
                : "—"}
            </strong>
          </div>

          {isLoadingRoster ? (
            <LoadingCard label="جارٍ تحميل المعلمين والتعيينات..." />
          ) : loadError ? (
            <Card className="border border-red-100 p-5 text-center" role="alert">
              <p className="text-sm text-red-700">{loadError}</p>
              <Button className="mt-4" variant="outline" onClick={() => void loadRoster()}>
                <RefreshCw size={16} />
                إعادة المحاولة
              </Button>
            </Card>
          ) : (
            <>
              <Card className="space-y-4 border border-[#0B4738]/15 p-4">
                <div>
                  <h3 className="font-semibold text-[#2C3E50]">إضافة أو تحديث تعيين</h3>
                  <p className="mt-1 text-xs leading-5 text-gray-500">
                    اختيار معلم سبق تعطيل تعيينه سيعيد تفعيل السجل نفسه بدل إنشاء نسخة مكررة.
                  </p>
                </div>
                {roster.teachers.length === 0 ? (
                  <p className="text-sm text-amber-700">
                    لا يوجد معلمون نشطون في فرع الحلقة.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label htmlFor="roster-teacher" className="text-sm font-medium text-[#2C3E50]">
                        المعلم
                      </label>
                      <select
                        id="roster-teacher"
                        value={selectedTeacherId}
                        onChange={event => setSelectedTeacherId(event.target.value)}
                        className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-[#2C3E50]"
                      >
                        {roster.teachers.map(teacher => (
                          <option key={teacher.id} value={teacher.id}>
                            {teacher.fullName}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="roster-role" className="text-sm font-medium text-[#2C3E50]">
                        الصفة
                      </label>
                      <select
                        id="roster-role"
                        value={selectedRole}
                        onChange={event =>
                          setSelectedRole(event.target.value as ClassTeacherAssignmentRole)
                        }
                        className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-[#2C3E50]"
                      >
                        <option value="primary">معلم أساسي</option>
                        <option value="assistant">معلم مساعد</option>
                      </select>
                    </div>
                  </div>
                )}
                <Button
                  type="button"
                  onClick={() => void save()}
                  disabled={isSaving || !selectedClass || !selectedTeacherId}
                  className="w-full bg-[#0B4738] text-white hover:bg-[#08382d] sm:w-auto"
                >
                  <UserPlus size={17} />
                  {isSaving ? "جارٍ الحفظ..." : "حفظ التعيين"}
                </Button>
              </Card>

              <section className="space-y-3">
                <h3 className="font-semibold text-[#2C3E50]">التعيينات النشطة</h3>
                {activeAssignments.length > 0 ? (
                  activeAssignments.map(renderAssignment)
                ) : (
                  <EmptyCard label="لا توجد تعيينات نشطة لهذه الحلقة." />
                )}
              </section>

              {inactiveAssignments.length > 0 && (
                <section className="space-y-3">
                  <h3 className="font-semibold text-[#2C3E50]">تعيينات سابقة غير نشطة</h3>
                  {inactiveAssignments.map(renderAssignment)}
                </section>
              )}
            </>
          )}
        </div>
      )}

      <DialogFooter className="sm:justify-start">
        <Button type="button" variant="outline" onClick={onClose}>
          إغلاق
        </Button>
      </DialogFooter>
    </>
  );
}

export default function RosterAssignmentLauncher({
  mode,
}: RosterAssignmentLauncherProps) {
  const { school } = useAuth();
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<RosterBranch[]>([]);
  const [isCheckingPermission, setIsCheckingPermission] = useState(true);

  useEffect(() => {
    let active = true;

    if (!school?.id) {
      setBranches([]);
      setIsCheckingPermission(false);
      return () => {
        active = false;
      };
    }

    setIsCheckingPermission(true);
    void fetchManageableRosterBranches(
      school.id,
      mode === "student-class" ? "students.manage" : "teachers.manage"
    )
      .then(rows => {
        if (active) setBranches(rows);
      })
      .catch(() => {
        if (active) setBranches([]);
      })
      .finally(() => {
        if (active) setIsCheckingPermission(false);
      });

    return () => {
      active = false;
    };
  }, [mode, school?.id]);

  if (!school?.id || isCheckingPermission || branches.length === 0) {
    return null;
  }

  const isStudentMode = mode === "student-class";

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 left-5 z-40 gap-2 rounded-full bg-[#0B4738] px-5 text-white shadow-xl hover:bg-[#08382d] md:bottom-7 md:left-7"
        aria-label={isStudentMode ? "إدارة ربط الطلاب بالحلقات" : "إدارة تعيين المعلمين للحلقات"}
      >
        {isStudentMode ? <Link2 size={18} /> : <BookOpenCheck size={18} />}
        <span className="hidden sm:inline">
          {isStudentMode ? "ربط الطلاب بالحلقات" : "تعيين معلمي الحلقات"}
        </span>
        <span className="sm:hidden">إدارة الربط</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl" dir="rtl">
          {isStudentMode ? (
            <StudentClassManager
              schoolId={school.id}
              branches={branches}
              onClose={() => setOpen(false)}
            />
          ) : (
            <TeacherAssignmentManager
              schoolId={school.id}
              branches={branches}
              onClose={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
