import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  assertCurrentAppVersion,
  isStaleAppVersionError,
} from "@/lib/app-version";
import {
  QURAN_SURAHS,
  getSurahByNumber,
  type MemorizationTeacher,
} from "@/lib/memorization";
import {
  MEMORIZATION_FOLLOW_UP_CATEGORIES,
  MEMORIZATION_FOLLOW_UP_CATEGORY_LABELS,
  MEMORIZATION_FOLLOW_UP_PRIORITY_LABELS,
  MEMORIZATION_FOLLOW_UP_STATUS_LABELS,
  createMemorizationFollowUpNote,
  fetchMemorizationFocusNotes,
  fetchMemorizationFollowUpHistory,
  getMemorizationFollowUpErrorMessage,
  setMemorizationFollowUpStatus,
  type MemorizationFollowUpCategory,
  type MemorizationFollowUpNote,
  type MemorizationFollowUpPriority,
  type MemorizationFollowUpStatus,
} from "@/lib/memorization-follow-up";

type Props = {
  schoolId: string;
  branchId: string;
  classId: string;
  studentId: string;
  studentName: string;
  canManage: boolean;
  teachers: MemorizationTeacher[];
  defaultTeacherId: string;
  teacherSelectionLocked: boolean;
  sourceRecordId: string | null;
  observedOn: string;
  suggestedSurahNumber: number;
  suggestedAyahStart: number;
  suggestedAyahEnd: number;
};

type FollowUpDraft = {
  teacherId: string;
  category: MemorizationFollowUpCategory;
  priority: MemorizationFollowUpPriority;
  surahNumber: number;
  ayahStart: number;
  ayahEnd: number;
  noteText: string;
};

function createDraft(props: Props): FollowUpDraft {
  return {
    teacherId: props.defaultTeacherId,
    category: "memorization_error",
    priority: 2,
    surahNumber: props.suggestedSurahNumber,
    ayahStart: props.suggestedAyahStart,
    ayahEnd: props.suggestedAyahEnd,
    noteText: "",
  };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ar-DZ-u-nu-latn", { dateStyle: "medium" }).format(
    new Date(`${value}T12:00:00`)
  );
}

function priorityClass(priority: MemorizationFollowUpPriority): string {
  if (priority === 1) return "border-red-200 bg-red-50 text-red-700";
  if (priority === 2) return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-gray-200 bg-gray-50 text-gray-600";
}

function statusClass(status: MemorizationFollowUpStatus): string {
  if (status === "resolved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "improved") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function FollowUpCard({
  note,
  canManage,
  updating,
  onStatus,
  compact = false,
}: {
  note: MemorizationFollowUpNote;
  canManage: boolean;
  updating: boolean;
  onStatus: (status: MemorizationFollowUpStatus) => void;
  compact?: boolean;
}) {
  const surah = getSurahByNumber(note.surahNumber);

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#0B4738]/10 px-2.5 py-1 text-xs font-bold text-[#0B4738]">
              {MEMORIZATION_FOLLOW_UP_CATEGORY_LABELS[note.category]}
            </span>
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-bold ${priorityClass(note.priority)}`}
            >
              أولوية {MEMORIZATION_FOLLOW_UP_PRIORITY_LABELS[note.priority]}
            </span>
            {compact && (
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusClass(note.status)}`}
              >
                {MEMORIZATION_FOLLOW_UP_STATUS_LABELS[note.status]}
              </span>
            )}
            {note.recurrenceCount > 1 && (
              <span className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-bold text-purple-700">
                تكرر ×{note.recurrenceCount}
              </span>
            )}
          </div>
          <h4 className="mt-2 text-sm font-bold text-[#2C3E50]">
            سورة {surah.name} — الآيات {note.ayahStart}
            {note.ayahEnd === note.ayahStart ? "" : `–${note.ayahEnd}`}
          </h4>
        </div>
        <span className="text-xs text-gray-500">{formatDate(note.observedOn)}</span>
      </div>

      <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-gray-700">
        {note.noteText}
      </p>
      <p className="mt-2 text-xs text-gray-500">
        سُجلت بواسطة: {note.teacherName || "معلم الحلقة"}
      </p>

      {!compact && canManage && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
          {note.status === "improved" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={updating}
              onClick={() => onStatus("open")}
            >
              {updating ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
              إعادة للتركيز
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={updating}
              onClick={() => onStatus("improved")}
            >
              {updating ? <Loader2 size={14} className="animate-spin" /> : <TrendingUp size={14} />}
              تحسّن
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={updating}
            onClick={() => onStatus("resolved")}
          >
            {updating ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            تمت المعالجة
          </Button>
        </div>
      )}
    </div>
  );
}

export function MemorizationFocusNotes(props: Props) {
  const [focusNotes, setFocusNotes] = useState<MemorizationFollowUpNote[]>([]);
  const [historyNotes, setHistoryNotes] = useState<MemorizationFollowUpNote[]>([]);
  const [sessionNotes, setSessionNotes] = useState<MemorizationFollowUpNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingNoteId, setUpdatingNoteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<FollowUpDraft>(() => createDraft(props));

  const selectedSurah = useMemo(
    () => getSurahByNumber(draft.surahNumber),
    [draft.surahNumber]
  );

  useEffect(() => {
    setDraft(createDraft(props));
    setShowForm(false);
    setShowHistory(false);
    // Suggested Quran range intentionally does not reset an open note form while
    // the teacher edits the main memorization record for the same student.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.branchId, props.classId, props.defaultTeacherId, props.studentId]);

  useEffect(() => {
    if (!props.schoolId || !props.branchId || !props.classId || !props.studentId) {
      setFocusNotes([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    void fetchMemorizationFocusNotes(
      props.schoolId,
      props.branchId,
      props.classId,
      props.studentId
    )
      .then(notes => {
        if (active) setFocusNotes(notes);
      })
      .catch(nextError => {
        if (active) setError(getMemorizationFollowUpErrorMessage(nextError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [props.branchId, props.classId, props.schoolId, props.studentId, reload]);

  useEffect(() => {
    if (!showHistory) return;

    let active = true;
    setHistoryLoading(true);
    setHistoryError(null);
    void fetchMemorizationFollowUpHistory(
      props.schoolId,
      props.branchId,
      props.classId,
      props.studentId
    )
      .then(notes => {
        if (active) setHistoryNotes(notes);
      })
      .catch(nextError => {
        if (active) setHistoryError(getMemorizationFollowUpErrorMessage(nextError));
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [props.branchId, props.classId, props.schoolId, props.studentId, reload, showHistory]);

  useEffect(() => {
    if (!props.sourceRecordId) {
      setSessionNotes([]);
      return;
    }
    let active = true;
    void fetchMemorizationFollowUpHistory(
      props.schoolId,
      props.branchId,
      props.classId,
      props.studentId
    ).then(notes => {
      if (active) {
        setSessionNotes(notes.filter(note => note.sourceRecordId === props.sourceRecordId));
      }
    }).catch(() => {
      if (active) setSessionNotes([]);
    });
    return () => { active = false; };
  }, [props.branchId, props.classId, props.schoolId, props.sourceRecordId, props.studentId, reload]);

  const updateDraft = (update: Partial<FollowUpDraft>) => {
    setDraft(current => ({ ...current, ...update }));
  };

  const handleSurahChange = (surahNumber: number) => {
    updateDraft({ surahNumber, ayahStart: 1, ayahEnd: 1 });
  };

  const handleCreate = async () => {
    if (!props.canManage || saving || !draft.teacherId) return;
    setSaving(true);
    setError(null);

    try {
      await assertCurrentAppVersion();
      await createMemorizationFollowUpNote({
        schoolId: props.schoolId,
        branchId: props.branchId,
        classId: props.classId,
        studentId: props.studentId,
        teacherId: draft.teacherId,
        sourceRecordId: props.sourceRecordId,
        category: draft.category,
        priority: draft.priority,
        surahNumber: draft.surahNumber,
        ayahStart: draft.ayahStart,
        ayahEnd: draft.ayahEnd,
        noteText: draft.noteText,
        observedOn: props.observedOn,
      });
      toast.success(props.sourceRecordId
        ? "تمت إضافة الملاحظة إلى جلسة التسميع. يمكنك إدراج ملاحظة أخرى الآن."
        : "تمت إضافة نقطة المتابعة. ستظهر تلقائيًا في الحصة القادمة ما دامت تحتاج متابعة.");
      setDraft(current => ({ ...current, noteText: "" }));
      setShowForm(Boolean(props.sourceRecordId));
      setReload(current => current + 1);
    } catch (nextError) {
      const message = isStaleAppVersionError(nextError)
        ? "توجد نسخة أحدث من المنصة. أعد تحميل الصفحة قبل إضافة الملاحظة."
        : getMemorizationFollowUpErrorMessage(nextError);
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (
    noteId: string,
    status: MemorizationFollowUpStatus
  ) => {
    if (!props.canManage || updatingNoteId) return;
    setUpdatingNoteId(noteId);
    setError(null);

    try {
      await assertCurrentAppVersion();
      await setMemorizationFollowUpStatus({
        schoolId: props.schoolId,
        branchId: props.branchId,
        classId: props.classId,
        noteId,
        status,
      });
      toast.success(
        status === "resolved"
          ? "تم حفظ أن هذه النقطة تمت معالجتها."
          : status === "improved"
            ? "تم تسجيل التحسن مع إبقاء النقطة تحت المراقبة."
            : "أعيدت النقطة إلى قائمة التركيز."
      );
      setReload(current => current + 1);
    } catch (nextError) {
      const message = isStaleAppVersionError(nextError)
        ? "توجد نسخة أحدث من المنصة. أعد تحميل الصفحة قبل تحديث الحالة."
        : getMemorizationFollowUpErrorMessage(nextError);
      setError(message);
      toast.error(message);
    } finally {
      setUpdatingNoteId(null);
    }
  };

  return (
    <section aria-label="نقاط تحتاج تركيزًا اليوم" className="space-y-3">
      <Card className="border border-[#C8A26A]/35 bg-[#C8A26A]/5 p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-bold text-[#2C3E50]">
              <Target size={20} className="text-[#0B4738]" />
              نقاط تحتاج تركيزًا اليوم
            </h2>
            <p className="mt-1 text-xs leading-6 text-gray-600">
              أحدث نقاط الضعف المفتوحة للطالب {props.studentName || "المحدد"}. التكرار محسوب من سجل الملاحظات ولا يُدخل يدويًا.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowHistory(current => !current)}
            >
              <History size={15} />
              {showHistory ? "إخفاء سجل الملاحظات" : "سجل الملاحظات المتعدد"}
            </Button>
            {props.canManage && props.teachers.length > 0 && (
              <Button
                type="button"
                size="sm"
                onClick={() => setShowForm(current => !current)}
                className="bg-[#0B4738] text-white hover:bg-[#08382D]"
              >
                {showForm ? <X size={15} /> : <Plus size={15} />}
                {showForm ? "إغلاق الإدراج" : "إضافة ملاحظة"}
              </Button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            <span>{error}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => setReload(current => current + 1)}>
              <RefreshCw size={14} />
              إعادة التحميل
            </Button>
          </div>
        )}

        {showForm && props.canManage && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-bold text-[#2C3E50]">
              {props.sourceRecordId ? "إضافة ملاحظة إلى جلسة التسميع" : "ملاحظة متابعة جديدة"}
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              إذا تكرر نفس النوع في نفس نطاق الآيات لاحقًا فسيزيد عداد التكرار تلقائيًا.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="space-y-2">
                <span className="text-xs font-semibold text-[#2C3E50]">المعلم</span>
                <select
                  value={draft.teacherId}
                  disabled={props.teacherSelectionLocked}
                  onChange={event => updateDraft({ teacherId: event.target.value })}
                  className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#0B4738] disabled:bg-gray-100"
                >
                  {props.teachers.map(teacher => (
                    <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold text-[#2C3E50]">نوع الملاحظة</span>
                <select
                  value={draft.category}
                  onChange={event => updateDraft({ category: event.target.value as MemorizationFollowUpCategory })}
                  className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#0B4738]"
                >
                  {MEMORIZATION_FOLLOW_UP_CATEGORIES.map(category => (
                    <option key={category} value={category}>{MEMORIZATION_FOLLOW_UP_CATEGORY_LABELS[category]}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold text-[#2C3E50]">الأولوية</span>
                <select
                  value={draft.priority}
                  onChange={event => updateDraft({ priority: Number(event.target.value) as MemorizationFollowUpPriority })}
                  className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#0B4738]"
                >
                  {([1, 2, 3] as const).map(priority => (
                    <option key={priority} value={priority}>{MEMORIZATION_FOLLOW_UP_PRIORITY_LABELS[priority]}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold text-[#2C3E50]">السورة</span>
                <select
                  value={draft.surahNumber}
                  onChange={event => handleSurahChange(Number(event.target.value))}
                  className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#0B4738]"
                >
                  {QURAN_SURAHS.map(surah => (
                    <option key={surah.number} value={surah.number}>{surah.number}. {surah.name}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold text-[#2C3E50]">من الآية</span>
                <Input
                  type="number"
                  min={1}
                  max={selectedSurah.ayahCount}
                  value={draft.ayahStart}
                  onChange={event => updateDraft({ ayahStart: Number(event.target.value) })}
                  className="h-10"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold text-[#2C3E50]">إلى الآية</span>
                <Input
                  type="number"
                  min={draft.ayahStart}
                  max={selectedSurah.ayahCount}
                  value={draft.ayahEnd}
                  onChange={event => updateDraft({ ayahEnd: Number(event.target.value) })}
                  className="h-10"
                />
              </label>
            </div>

            <label className="mt-3 block space-y-2">
              <span className="text-xs font-semibold text-[#2C3E50]">ملاحظة المعلم</span>
              <Textarea
                value={draft.noteText}
                maxLength={1000}
                rows={3}
                placeholder="مثال: يتردد في بداية الآية ويخلط بينها وبين الموضع المشابه..."
                onChange={event => updateDraft({ noteText: event.target.value })}
                className="resize-none"
              />
            </label>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-gray-500">
                {props.sourceRecordId
                  ? `سترتبط الملاحظة بسجل التسميع الحالي. الملاحظات المدرجة: ${sessionNotes.length}`
                  : "يمكن إضافة الملاحظة مستقلة عن سجل جلسة محدد."}
              </p>
              <Button
                type="button"
                disabled={saving || !draft.teacherId || draft.noteText.trim().length === 0}
                onClick={() => void handleCreate()}
                className="bg-[#0B4738] text-white hover:bg-[#08382D]"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {props.sourceRecordId && sessionNotes.length > 0 ? "حفظ وإضافة ملاحظة أخرى" : "حفظ الملاحظة"}
              </Button>
            </div>
          </div>
        )}

        {props.sourceRecordId && sessionNotes.length > 0 && (
          <div className="mt-4 rounded-xl border border-[#17663B]/20 bg-[#F5FBF7] p-3">
            <h3 className="text-sm font-bold text-[#173B2D]">
              ملاحظات جلسة التسميع الحالية ({sessionNotes.length})
            </h3>
            <p className="mt-1 text-xs text-gray-600">
              يمكن إدراج أكثر من ملاحظة في الجلسة نفسها، ويُحفظ كل بند مستقلًا في السجل.
            </p>
            <div className="mt-3 space-y-2">
              {sessionNotes.map((note, index) => (
                <div key={note.id} className="rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <strong className="text-[#17663B]">#{index + 1}</strong>
                    <span>{MEMORIZATION_FOLLOW_UP_CATEGORY_LABELS[note.category]}</span>
                    <span>•</span>
                    <span>سورة {getSurahByNumber(note.surahNumber).name} — {note.ayahStart}–{note.ayahEnd}</span>
                  </div>
                  <p className="mt-1 leading-6 text-[#40564B]">{note.noteText}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 space-y-2">
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-gray-500" role="status">
              <Loader2 size={16} className="animate-spin" />
              جارٍ تحميل نقاط التركيز...
            </div>
          ) : focusNotes.length === 0 && !error ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800" role="status">
              لا توجد نقاط مفتوحة تحتاج تركيزًا خاصًا لهذا الطالب حاليًا.
            </div>
          ) : (
            focusNotes.map(note => (
              <FollowUpCard
                key={note.id}
                note={note}
                canManage={props.canManage}
                updating={updatingNoteId === note.id}
                onStatus={status => void handleStatus(note.id, status)}
              />
            ))
          )}
        </div>
      </Card>

      {showHistory && (
        <Card className="border border-gray-100 p-4 shadow-sm">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-[#2C3E50]">
              <History size={17} className="text-[#0B4738]" />
              سجل ملاحظات وأخطاء الطالب
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              يحتفظ بالسجل السابق حتى بعد التحسن أو المعالجة، ولا توجد عملية حذف من الواجهة.
            </p>
          </div>

          {historyError && (
            <p className="mt-3 text-sm text-red-700" role="alert">{historyError}</p>
          )}
          <div className="mt-3 space-y-2">
            {historyLoading ? (
              <div className="flex items-center gap-2 py-3 text-sm text-gray-500" role="status">
                <Loader2 size={16} className="animate-spin" />
                جارٍ تحميل سجل الملاحظات...
              </div>
            ) : historyNotes.length === 0 && !historyError ? (
              <p className="text-sm text-gray-500">لا توجد ملاحظات سابقة لهذا الطالب.</p>
            ) : (
              historyNotes.map(note => (
                <FollowUpCard
                  key={note.id}
                  note={note}
                  canManage={false}
                  updating={false}
                  compact
                  onStatus={() => undefined}
                />
              ))
            )}
          </div>
        </Card>
      )}
    </section>
  );
}
