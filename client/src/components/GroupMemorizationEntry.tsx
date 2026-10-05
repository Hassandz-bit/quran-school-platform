import { useMemo, useState } from "react";
import { BookOpenCheck, CheckCircle2, Loader2, RotateCcw, Save, Users } from "lucide-react";
import { toast } from "sonner";
import StudentAvatar from "@/components/StudentAvatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  assertCurrentAppVersion,
  isStaleAppVersionError,
} from "@/lib/app-version";
import {
  MEMORIZATION_SESSION_TYPES,
  QURAN_SURAHS,
  getMemorizationErrorMessage,
  getMemorizationSessionLabel,
  getSurahByNumber,
  saveMemorizationGroup,
  type MemorizationDraft,
  type MemorizationSessionType,
  type MemorizationStudent,
  type MemorizationTeacher,
} from "@/lib/memorization";

type GroupEntry = {
  studentId: string;
  selected: boolean;
  rating: number;
  errorsCount: number;
  notes: string;
  nextAssignment: string;
};

type GroupMemorizationEntryProps = {
  schoolId: string;
  branchId: string;
  classId: string;
  recordDate: string;
  students: MemorizationStudent[];
  teachers: MemorizationTeacher[];
  defaultTeacherId: string;
  teacherSelectionDisabled: boolean;
  onSaved: () => void;
};

const sessionOptions = MEMORIZATION_SESSION_TYPES.map(value => ({
  value,
  label: getMemorizationSessionLabel(value),
}));

export default function GroupMemorizationEntry({
  schoolId,
  branchId,
  classId,
  recordDate,
  students,
  teachers,
  defaultTeacherId,
  teacherSelectionDisabled,
  onSaved,
}: GroupMemorizationEntryProps) {
  const [teacherId, setTeacherId] = useState(defaultTeacherId);
  const [sessionType, setSessionType] = useState<MemorizationSessionType>("new_memorization");
  const [surahNumber, setSurahNumber] = useState(1);
  const [ayahStart, setAyahStart] = useState(1);
  const [ayahEnd, setAyahEnd] = useState(1);
  const [entries, setEntries] = useState<GroupEntry[]>(() => students.map(student => ({
    studentId: student.id,
    selected: true,
    rating: 3,
    errorsCount: 0,
    notes: "",
    nextAssignment: "",
  })));
  const [saving, setSaving] = useState(false);
  const [groupSaved, setGroupSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  const selectedSurah = useMemo(() => getSurahByNumber(surahNumber), [surahNumber]);
  const selectedCount = entries.filter(entry => entry.selected).length;
  const allSelected = entries.length > 0 && selectedCount === entries.length;
  const validPortion = ayahStart >= 1 && ayahEnd >= ayahStart && ayahEnd <= selectedSurah.ayahCount;
  const controlsDisabled = saving || groupSaved;

  const updateEntry = (studentId: string, update: Partial<GroupEntry>) => {
    if (controlsDisabled) return;
    setEntries(current => current.map(entry =>
      entry.studentId === studentId ? { ...entry, ...update } : entry
    ));
    setSaveError(null);
  };

  const handleSave = async () => {
    if (saving || groupSaved || !teacherId || !validPortion || selectedCount === 0) return;
    const selectedEntries = entries.filter(entry => entry.selected);
    const invalidEntry = selectedEntries.some(entry =>
      !Number.isInteger(entry.rating) || entry.rating < 1 || entry.rating > 5 ||
      !Number.isInteger(entry.errorsCount) || entry.errorsCount < 0 || entry.errorsCount > 100 ||
      entry.notes.trim().length > 1000 || entry.nextAssignment.trim().length > 1000
    );
    if (invalidEntry) {
      setSaveError("تحقق من التقييم والأخطاء والملاحظات لكل طالب قبل الحفظ.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      await assertCurrentAppVersion();
      const result = await saveMemorizationGroup({
        schoolId,
        branchId,
        classId,
        entries: selectedEntries.map(entry => {
          const draft: MemorizationDraft = {
            recordId: null,
            teacherId,
            recordDate,
            sessionType,
            surahNumber,
            ayahStart,
            ayahEnd,
            rating: entry.rating,
            errorsCount: entry.errorsCount,
            notes: entry.notes,
            nextAssignment: entry.nextAssignment,
          };
          return { studentId: entry.studentId, draft };
        }),
      });
      setSavedCount(result.savedCount);
      setGroupSaved(true);
      const successMessage = "تم حفظ المتابعة الجماعية بنجاح.";
      toast.success(successMessage);
      onSaved();
    } catch (error) {
      const message = isStaleAppVersionError(error)
        ? "توجد نسخة أحدث من المنصة. أعد تحميل الصفحة قبل الحفظ لتجنب تسجيل دفعة مكررة."
        : getMemorizationErrorMessage(error);
      setSaveError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleNewGroup = () => {
    setEntries(students.map(student => ({
      studentId: student.id,
      selected: true,
      rating: 3,
      errorsCount: 0,
      notes: "",
      nextAssignment: "",
    })));
    setGroupSaved(false);
    setSavedCount(0);
    setSaveError(null);
  };

  return (
    <Card className="border border-[#C8A26A]/30 bg-white p-4 shadow-sm md:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-bold text-[#2C3E50]">
            <BookOpenCheck size={20} className="text-[#0B4738]" />
            حفظ جماعي للحلقة
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600">
            أدخل الجزء مرة واحدة، ثم سجّل تقييمًا وعدد أخطاء وملاحظة مستقلة لكل طالب. تُحفظ سجلات المجموعة معًا أو لا يُحفظ أي منها.
          </p>
        </div>
        {groupSaved && (
          <Button type="button" variant="outline" onClick={handleNewGroup}>
            <RotateCcw size={16} />
            تسجيل مجموعة جديدة
          </Button>
        )}
      </div>

      <section aria-label="بيانات الجزء المشترك" className="rounded-xl border border-gray-100 bg-gray-50/70 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[#0B4738]">
          <Users size={17} />
          الجزء المشترك وبيانات الحصة
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1.5">
            <span className="text-sm font-semibold text-[#2C3E50]">المعلم</span>
            <select
              aria-label="معلم المجموعة"
              value={teacherId}
              onChange={event => setTeacherId(event.target.value)}
              disabled={teacherSelectionDisabled || controlsDisabled}
              className="h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-sm disabled:bg-gray-100"
            >
              {teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>)}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-semibold text-[#2C3E50]">نوع المتابعة</span>
            <select
              aria-label="نوع متابعة المجموعة"
              value={sessionType}
              onChange={event => setSessionType(event.target.value as MemorizationSessionType)}
              disabled={controlsDisabled}
              className="h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-sm disabled:bg-gray-100"
            >
              {sessionOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-semibold text-[#2C3E50]">السورة المشتركة</span>
            <select
              aria-label="السورة المشتركة"
              value={surahNumber}
              onChange={event => {
                const nextSurah = Number(event.target.value);
                setSurahNumber(nextSurah);
                setAyahStart(1);
                setAyahEnd(1);
              }}
              disabled={controlsDisabled}
              className="h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-sm disabled:bg-gray-100"
            >
              {QURAN_SURAHS.map(surah => <option key={surah.number} value={surah.number}>{surah.number}. {surah.name}</option>)}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-semibold text-[#2C3E50]">من الآية</span>
            <Input
              aria-label="بداية الآيات المشتركة"
              type="number"
              min={1}
              max={selectedSurah.ayahCount}
              value={ayahStart}
              disabled={controlsDisabled}
              onChange={event => setAyahStart(Number(event.target.value))}
              className="h-11"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-semibold text-[#2C3E50]">إلى الآية</span>
            <Input
              aria-label="نهاية الآيات المشتركة"
              type="number"
              min={ayahStart}
              max={selectedSurah.ayahCount}
              value={ayahEnd}
              disabled={controlsDisabled}
              onChange={event => setAyahEnd(Number(event.target.value))}
              className="h-11"
            />
            <span className="text-xs text-gray-500">الحد الأعلى لسورة {selectedSurah.name}: {selectedSurah.ayahCount}</span>
          </label>
        </div>
      </section>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-[#2C3E50]">علامات الطلاب وملاحظاتهم</h3>
          <p className="mt-1 text-xs text-gray-500">المحددون: {selectedCount} من {students.length} · التاريخ: {recordDate}</p>
        </div>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-[#2C3E50]">
          <input
            type="checkbox"
            aria-label="اختيار جميع الطلاب للحفظ الجماعي"
            checked={allSelected}
            disabled={controlsDisabled}
            onChange={event => setEntries(current => current.map(entry => ({ ...entry, selected: event.target.checked })))}
            className="size-4 accent-[#0B4738]"
          />
          تحديد الجميع
        </label>
      </div>

      <div className="mt-3 space-y-3">
        {entries.map((entry, index) => {
          const student = students.find(item => item.id === entry.studentId);
          if (!student) return null;
          return (
            <article key={entry.studentId} className={`rounded-xl border p-3 md:p-4 ${entry.selected ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50/60 opacity-70"}`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 text-sm font-bold text-[#2C3E50]">
                  <input
                    type="checkbox"
                    checked={entry.selected}
                    disabled={controlsDisabled}
                    onChange={event => updateEntry(student.id, { selected: event.target.checked })}
                    className="size-4 accent-[#0B4738]"
                  />
                  <StudentAvatar photoUrl={student.photoUrl} className="size-9" />
                  <span>{index + 1}. {student.fullName}</span>
                </label>
                <span className="rounded-full bg-[#0B4738]/10 px-3 py-1 text-xs font-bold text-[#0B4738]">
                  {entry.selected ? "مشارك" : "مستثنى"}
                </span>
              </div>

              {entry.selected && (
                <div className="grid gap-3 md:grid-cols-[minmax(12rem,0.8fr)_minmax(0,2fr)]">
                  <div className="space-y-3">
                    <fieldset className="space-y-2">
                      <legend className="text-xs font-semibold text-gray-600">التقييم (1–5)</legend>
                      <div className="grid grid-cols-5 gap-1.5" role="group">
                        {[1, 2, 3, 4, 5].map(rating => (
                          <button
                            key={rating}
                            type="button"
                            aria-pressed={entry.rating === rating}
                            disabled={controlsDisabled}
                            onClick={() => updateEntry(student.id, { rating })}
                            className={`min-h-10 rounded-lg border text-sm font-bold ${entry.rating === rating ? "border-[#C8A26A] bg-[#C8A26A] text-[#0B4738]" : "border-gray-200 bg-white text-gray-600"}`}
                          >
                            {rating}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-gray-600">عدد الأخطاء</span>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={entry.errorsCount}
                        disabled={controlsDisabled}
                        onChange={event => updateEntry(student.id, { errorsCount: Number(event.target.value) })}
                        className="h-10"
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-gray-600">ملاحظة الطالب</span>
                      <Textarea
                        value={entry.notes}
                        maxLength={1000}
                        rows={3}
                        disabled={controlsDisabled}
                        onChange={event => updateEntry(student.id, { notes: event.target.value })}
                        placeholder="اختياري — خاصة بأداء هذا الطالب"
                        className="min-h-20 resize-y"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-gray-600">الواجب القادم</span>
                      <Textarea
                        value={entry.nextAssignment}
                        maxLength={1000}
                        rows={3}
                        disabled={controlsDisabled}
                        onChange={event => updateEntry(student.id, { nextAssignment: event.target.value })}
                        placeholder="اختياري"
                        className="min-h-20 resize-y"
                      />
                    </label>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {saveError && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{saveError}</p>}
      {groupSaved && (
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-800" role="status">
          <CheckCircle2 size={18} />
          <span>تم حفظ المتابعة الجماعية بنجاح. عدد السجلات: {savedCount}. عدّل أي سجل فرديًا من وضع المتابعة الفردية عند الحاجة.</span>
        </p>
      )}

      <div className="sticky bottom-3 z-10 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <p className="text-xs text-gray-500">{groupSaved ? "اكتمل التسجيل الجماعي." : "سيُحفظ الجزء المشترك في سجلات مستقلة مع ملاحظات كل طالب."}</p>
        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={controlsDisabled || selectedCount === 0 || !teacherId || !validPortion}
          className="h-11 min-w-44 bg-[#0B4738] text-white hover:bg-[#08382D]"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {saving ? "جارٍ حفظ المجموعة..." : groupSaved ? "تم الحفظ" : "حفظ المتابعة الجماعية"}
        </Button>
      </div>
    </Card>
  );
}
