import { useCallback, useEffect, useState } from "react";
import { BookOpenCheck, Building2, RefreshCw, School, UsersRound } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { listMyGuardianStudents, type ParentStudent } from "@/lib/parent-portal";

function relationshipLabel(value: string): string {
  return (
    {
      father: "الأب",
      mother: "الأم",
      legal_guardian: "الولي القانوني",
      relative: "قريب",
      other: "ولي أمر",
    }[value] ?? "ولي أمر"
  );
}

export default function ParentHome() {
  const [, setLocation] = useLocation();
  const [students, setStudents] = useState<ParentStudent[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const nextStudents = await listMyGuardianStudents();
      setStudents(nextStudents);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") {
    return (
      <div className="flex min-h-[45vh] items-center justify-center" role="status">
        <span className="size-6 animate-spin rounded-full border-2 border-[#17663B]/30 border-t-[#17663B]" />
      </div>
    );
  }

  if (state === "error") {
    return (
      <section className="rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-[#173B2D]">تعذر تحميل بيانات الأبناء</h1>
        <p className="mt-2 text-sm text-red-700">تعذر جلب البيانات حاليًا. لم يتم عرض أي بيانات بديلة.</p>
        <Button type="button" onClick={() => void load()} className="mt-5 gap-2 bg-[#0B4738] text-white">
          <RefreshCw size={17} /> إعادة المحاولة
        </Button>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-[#8A6A2E]">المتابعة الأسرية</p>
        <h1 className="mt-1 text-2xl font-bold text-[#173B2D] sm:text-3xl">أبنائي</h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-[#607368]">
          تابع الحضور والحفظ لكل طالب مرتبط بحسابك. لا تظهر هنا إلا العلاقات النشطة.
        </p>
      </header>

      <div className="flex items-center gap-3 rounded-2xl border border-[#DCE7DF] bg-white p-4 shadow-sm">
        <span className="flex size-11 items-center justify-center rounded-xl bg-[#E8F3EC] text-[#17663B]">
          <UsersRound size={22} />
        </span>
        <div>
          <p className="text-xs text-[#6A7B72]">عدد الأبناء المرتبطين</p>
          <p className="text-2xl font-bold text-[#173B2D]">{students.length}</p>
        </div>
      </div>

      {students.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-[#C8D8CE] bg-white p-8 text-center">
          <UsersRound className="mx-auto text-[#809188]" size={36} />
          <h2 className="mt-3 font-bold text-[#173B2D]">لا توجد علاقات نشطة</h2>
          <p className="mt-2 text-sm text-[#607368]">عند تفعيل ربط أحد الأبناء سيظهر هنا تلقائيًا.</p>
        </section>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {students.map(student => (
            <article key={`${student.schoolId}-${student.studentId}`} className="rounded-2xl border border-[#DCE7DF] bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#0B4738] text-white">
                      <BookOpenCheck size={20} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-bold text-[#173B2D]">
                        {student.firstName} {student.lastName}
                      </h2>
                      <p className="text-xs text-[#8A6A2E]">
                        {relationshipLabel(student.relationshipType)}{student.isPrimary ? " · ولي أساسي" : ""}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex items-center gap-2 text-[#52675C]">
                  <School size={16} className="text-[#17663B]" />
                  <span className="truncate">{student.schoolName}</span>
                </div>
                <div className="flex items-center gap-2 text-[#52675C]">
                  <Building2 size={16} className="text-[#17663B]" />
                  <span className="truncate">{student.branchName}</span>
                </div>
                <div className="flex items-center gap-2 text-[#52675C]">
                  <BookOpenCheck size={16} className="text-[#17663B]" />
                  <span className="truncate">{student.className ?? "غير مسند إلى حلقة حاليًا"}</span>
                </div>
              </dl>

              <Button
                type="button"
                onClick={() => setLocation(`/parent/students/${student.studentId}`)}
                className="mt-5 w-full bg-[#0B4738] text-white hover:bg-[#08382d]"
              >
                عرض المتابعة الأكاديمية
              </Button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
