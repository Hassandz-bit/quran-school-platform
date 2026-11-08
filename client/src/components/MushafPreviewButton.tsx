import { useEffect, useMemo, useState } from "react";
import { BookOpen, Highlighter, Loader2, X } from "lucide-react";
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

// Read the published item metadata; check-attachment is only a lightweight
// availability check and does not return the attachment list.
const ISLAMHOUSE_ITEM_API =
  "https://api3.islamhouse.com/v3/paV29H2gm56kvLPy/main/get-item/2790112/ar/json";
const ISLAMCONTENT_ITEM_PAGE = "https://islamcontent.com/ar/content/2885";

type Attachment = {
  url?: string;
  extension_type?: string;
};

type IslamHouseItem = {
  attachments?: Attachment[];
};

export default function MushafPreviewButton({
  surahNumber,
  surahName,
  ayahStart,
  ayahEnd,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState(false);

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

  useEffect(() => {
    if (!open || pdfUrl || pdfError) return;
    const controller = new AbortController();
    setLoadingPdf(true);

    fetch(ISLAMHOUSE_ITEM_API, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error("Unable to load IslamHouse item");
        return response.json() as Promise<IslamHouseItem>;
      })
      .then(item => {
        const attachments = Array.isArray(item?.attachments) ? item.attachments : [];
        const attachment = attachments.find(file =>
          (file.extension_type || "").toLowerCase() === "pdf" ||
          (file.url || "").toLowerCase().split(/[?#]/, 1)[0].endsWith(".pdf"),
        );
        const rawUrl = attachment?.url;
        const url = rawUrl?.replace(/^http:\/\//i, "https://");
        if (!url || !/^https:\/\//i.test(url) || !/\.pdf(?:$|[?#])/i.test(url)) {
          throw new Error("PDF attachment URL is unavailable");
        }
        setPdfUrl(url);
      })
      .catch(error => {
        if (error.name !== "AbortError") setPdfError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingPdf(false);
      });

    return () => controller.abort();
  }, [open, pdfUrl, pdfError]);

  const pdfPageUrl = pdfUrl && pageRange
    ? `${pdfUrl}#page=${pageRange.first}`
    : pdfUrl;

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
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-2 sm:p-4"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="warsh-mushaf-preview-title"
            className="flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            dir="rtl"
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 p-3 sm:p-4">
              <div>
                <h2 id="warsh-mushaf-preview-title" className="flex items-center gap-2 text-lg font-bold text-[#0B4738]">
                  <BookOpen size={20} />
                  مصحف التجويد الملون — ورش بتوسط البدل
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  رواية ورش عن نافع · مصحف منشور عبر IslamHouse · ملف PDF بحجم 338 ميغابايت
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="إغلاق">
                <X size={20} />
              </button>
            </header>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 sm:px-4">
              <div className="flex items-center gap-2 text-sm font-bold text-amber-950">
                <Highlighter size={17} />
                المقطع المحدد: سورة {surahName}، الآيات {ayahStart}–{ayahEnd}
              </div>
              {pageRange && (
                <span className="text-xs font-semibold text-amber-900">
                  {pageRange.first === pageRange.last
                    ? `صفحة ${pageRange.first}`
                    : `الصفحات ${pageRange.first}–${pageRange.last}`}
                </span>
              )}
            </div>

            <div className="relative min-h-0 flex-1 bg-gray-100">
              {loadingPdf && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white text-sm text-gray-600">
                  <Loader2 className="animate-spin" size={28} />
                  جارٍ تحميل بيانات المصحف وتجهيز الصفحة...
                </div>
              )}
              {pdfPageUrl ? (
                <iframe
                  title="مصحف التجويد الملون برواية ورش بتوسط البدل"
                  src={pdfPageUrl}
                  className="h-full w-full border-0"
                  allow="fullscreen"
                />
              ) : pdfError ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                  <BookOpen size={36} className="text-[#0B4738]" />
                  <p className="max-w-lg text-sm leading-6 text-gray-700">
                    تعذر تحميل بيانات المصحف حاليًا. حاول مرة أخرى لاحقًا، أو افتح بيانات النسخة المنشورة لدى المصدر.
                  </p>
                  <a href={ISLAMCONTENT_ITEM_PAGE} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#0B4738] underline">
                    فتح صفحة المصحف لدى المصدر
                  </a>
                </div>
              ) : null}
            </div>

            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-500 sm:px-4">
              <span>المصدر: IslamHouse / IslamContent — يُعرض المصحف دون تعديل على نصه أو صفحاته.</span>
              <a href={ISLAMCONTENT_ITEM_PAGE} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#0B4738] underline">
                بيانات المصدر والترخيص
              </a>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
