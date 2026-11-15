import { useMemo, useState } from "react";
import { BookOpen, Highlighter, X } from "lucide-react";
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

// User-provided Google Drive file. The file itself remains in the user's Drive.
const MUSHAF_DRIVE_FILE_ID = "1KRu-KPo3eRlrywnyf4_06XF-Ypu9kXGW";
const MUSHAF_DRIVE_PREVIEW = `https://drive.google.com/file/d/${MUSHAF_DRIVE_FILE_ID}/preview`;
const MUSHAF_DRIVE_FILE = `https://drive.google.com/file/d/${MUSHAF_DRIVE_FILE_ID}/view`;

export default function MushafPreviewButton({
  surahNumber, surahName, ayahStart, ayahEnd, disabled = false,
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
    Number.isInteger(surahNumber) && surahNumber >= 1 && surahNumber <= 114 &&
    Number.isInteger(ayahStart) && Number.isInteger(ayahEnd) &&
    ayahStart >= 1 && ayahEnd >= ayahStart && Boolean(pageRange);

  const pdfPageUrl = pageRange
    ? `${MUSHAF_DRIVE_PREVIEW}#page=${pageRange.first}`
    : MUSHAF_DRIVE_PREVIEW;

  return (
    <>
      <button type="button" disabled={disabled || !validRange} onClick={() => setOpen(true)}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#0B4738]/25 bg-[#E8F3EC] px-3 text-sm font-bold text-[#0B4738] hover:bg-[#DCEDE3] disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={`معاينة المصحف: ${surahName} من الآية ${ayahStart} إلى ${ayahEnd}`}>
        <BookOpen size={16} />معاينة المصحف
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-2 sm:p-4" role="presentation"
          onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="warsh-mushaf-preview-title"
            className="flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" dir="rtl">
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 p-3 sm:p-4">
              <div>
                <h2 id="warsh-mushaf-preview-title" className="flex items-center gap-2 text-lg font-bold text-[#0B4738]">
                  <BookOpen size={20} />مصحف التجويد الملون — ورش بتوسط البدل
                </h2>
                <p className="mt-1 text-xs text-gray-500">رواية ورش عن نافع · النسخة التي رفعها مسؤول المنصة إلى Google Drive</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="إغلاق"><X size={20} /></button>
            </header>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 sm:px-4">
              <div className="flex items-center gap-2 text-sm font-bold text-amber-950">
                <Highlighter size={17} />المقطع المحدد: سورة {surahName}، الآيات {ayahStart}–{ayahEnd}
              </div>
              {pageRange && <span className="text-xs font-semibold text-amber-900">
                {pageRange.first === pageRange.last ? `صفحة ${pageRange.first}` : `الصفحات ${pageRange.first}–${pageRange.last}`}
              </span>}
            </div>
            <div className="relative min-h-0 flex-1 bg-gray-100">
              <iframe title="مصحف التجويد الملون برواية ورش بتوسط البدل" src={pdfPageUrl}
                className="h-full w-full border-0" allow="fullscreen" />
            </div>
            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-500 sm:px-4">
              <span>المصدر: ملف المصحف الذي وفره مسؤول المنصة عبر Google Drive، ويُعرض دون تعديل على صفحاته.</span>
              <a href={MUSHAF_DRIVE_FILE} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#0B4738] underline">فتح الملف في Google Drive</a>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
