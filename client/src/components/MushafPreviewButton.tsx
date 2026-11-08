import { useMemo, useState } from "react";
import { BookOpen, ExternalLink, Highlighter, X } from "lucide-react";
import warshPages from "@/data/warsh-mushaf-pages.json";

type Props = {
  surahNumber: number;
  surahName: string;
  ayahStart: number;
  ayahEnd: number;
  disabled?: boolean;
};

const pages = (warshPages as {
  riwayah: string;
  totalPages: number;
  pages: Record<string, Record<string, number>>;
}).pages;

const ASSABILE_READER = "https://www.assabile.com/quran/mushaf/warsh";
const ASSABILE_COLORED_PDF = "https://www.assabile.com/telecharger-le-coran-pdf/tajwid-warsh/download";

export default function MushafPreviewButton({
  surahNumber,
  surahName,
  ayahStart,
  ayahEnd,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const pageRange = useMemo(() => {
    const surahPages = pages[String(surahNumber)];
    if (!surahPages) return null;
    const first = surahPages[String(ayahStart)];
    const last = surahPages[String(ayahEnd)];
    return first && last ? { first, last } : null;
  }, [surahNumber, ayahStart, ayahEnd]);

  const validRange =
    Number.isInteger(surahNumber) &&
    surahNumber >= 1 &&
    surahNumber <= 114 &&
    Number.isInteger(ayahStart) &&
    Number.isInteger(ayahEnd) &&
    ayahStart >= 1 &&
    ayahEnd >= ayahStart &&
    Boolean(pageRange);

  const readerUrl = pageRange
    ? `${ASSABILE_READER}/${pageRange.first}`
    : ASSABILE_READER;
  const coloredPdfUrl = pageRange
    ? `${ASSABILE_COLORED_PDF}#page=${pageRange.first}`
    : ASSABILE_COLORED_PDF;

  return (
    <>
      <button
        type="button"
        disabled={disabled || !validRange}
        onClick={() => setOpen(true)}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#0B4738]/25 bg-[#E8F3EC] px-3 text-sm font-bold text-[#0B4738] hover:bg-[#DCEDE3] disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={`معاينة المصحف: ${surahName} من الآية ${ayahStart} إلى ${ayahEnd}`}
      >
        <BookOpen size={16} />
        معاينة المصحف
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-3"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="warsh-mushaf-preview-title"
            className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl"
            dir="rtl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="warsh-mushaf-preview-title" className="flex items-center gap-2 text-lg font-bold text-[#0B4738]">
                  <BookOpen size={20} />
                  معاينة المصحف
                </h2>
                <p className="mt-1 text-sm text-gray-500">رواية ورش عن نافع — طريق الأزرق</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="إغلاق">
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
                <Highlighter size={17} />
                المقطع المحدد للحفظ أو التسميع
              </div>
              <p className="mt-2 text-base font-bold text-gray-900">
                سورة {surahName} — الآيات {ayahStart} إلى {ayahEnd}
              </p>
              {pageRange && (
                <p className="mt-1 text-xs text-amber-900">
                  موضع المقطع في مصحف ورش: {pageRange.first === pageRange.last ? `الصفحة ${pageRange.first}` : `من الصفحة ${pageRange.first} إلى الصفحة ${pageRange.last}`}
                </p>
              )}
            </div>

            <p className="mt-4 text-sm leading-6 text-gray-600">
              اختر فتح المصحف الملون أو المعاينة الرقمية برواية ورش. سيُفتح المصحف عند الصفحة التي تبدأ فيها الآيات المحددة، ويظل نطاق الحفظ ظاهرًا هنا للرجوع إليه.
            </p>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <a
                href={coloredPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#0B4738] px-3 text-center text-sm font-bold text-white hover:bg-[#08382D]"
              >
                <ExternalLink size={16} />
                فتح مصحف ورش الملون
              </a>
              <a
                href={readerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 text-center text-sm font-bold text-[#0B4738] hover:bg-gray-50"
              >
                <BookOpen size={16} />
                معاينة ورش مباشرة
              </a>
            </div>
            <p className="mt-3 text-xs leading-5 text-gray-500">
              صفحات المصحف الملون تُعرض من مصدرها الخارجي ولا تُنسخ إلى خوادم المنصة. تظليل نطاق الآيات داخل الصفحة المصورة نفسها يحتاج ترخيصًا أو واجهة عرض تسمح بإضافة طبقة تظليل فوق الصفحة.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
