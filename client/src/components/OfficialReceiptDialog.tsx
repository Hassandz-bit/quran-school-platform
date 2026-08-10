import { Printer, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocale } from "@/contexts/LocaleContext";
import { formatDzd } from "@/lib/finance";
import { amountToWords, type OfficialReceipt } from "@/lib/receipts";

const paymentMethodLabels = {
  ar: {
    cash: "نقدًا",
    bank_transfer: "تحويل بنكي",
    postal: "بريدي",
    cheque: "شيك",
    other: "أخرى",
  },
  en: {
    cash: "Cash",
    bank_transfer: "Bank transfer",
    postal: "Postal",
    cheque: "Cheque",
    other: "Other",
  },
} as const;

const chargeTypeLabels = {
  ar: {
    fee: "رسوم دراسية",
    registration: "رسوم تسجيل",
    materials: "لوازم",
    transport: "نقل",
    other: "أخرى",
  },
  en: {
    fee: "Tuition fee",
    registration: "Registration fee",
    materials: "Materials",
    transport: "Transport",
    other: "Other",
  },
} as const;

export default function OfficialReceiptDialog({
  receipt,
  open,
  onOpenChange,
}: {
  receipt: OfficialReceipt | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { locale, direction } = useLocale();
  if (!receipt) return null;

  const copy =
    locale === "ar"
      ? {
          title: receipt.receiptType === "payment" ? "وصل دفع رسمي" : "وصل تسجيل رسمي",
          print: "طباعة / حفظ PDF",
          number: "رقم الوصل",
          school: "المدرسة",
          branch: "الفرع",
          student: "الطالب",
          guardian: "ولي الأمر",
          enrollment: "تاريخ التسجيل",
          description: "البيان",
          amount: "المبلغ",
          amountWords: "المبلغ بالحروف",
          method: "طريقة الدفع",
          paymentDate: "تاريخ الدفع",
          reference: "المرجع",
          issuedBy: "استلم / أصدر بواسطة",
          issuedAt: "تاريخ الإصدار",
          status: "حالة الوصل",
          issued: "صالح",
          reversed: "معكوس / ملغى محاسبيًا",
          reversedNotice:
            "هذا الوصل مرتبط بدفعة تم عكسها محاسبيًا. يبقى محفوظًا لأغراض التدقيق ولا يُعد إثباتًا لسداد قائم.",
          noAmount: "إثبات تسجيل — دون مبلغ مالي",
          registration: "إثبات تسجيل الطالب بالمدرسة",
          original: "نسخة رسمية من QuranOS",
          noValue: "—",
        }
      : {
          title: receipt.receiptType === "payment" ? "Official Payment Receipt" : "Official Registration Receipt",
          print: "Print / Save PDF",
          number: "Receipt no.",
          school: "School",
          branch: "Branch",
          student: "Student",
          guardian: "Guardian",
          enrollment: "Registration date",
          description: "Description",
          amount: "Amount",
          amountWords: "Amount in words",
          method: "Payment method",
          paymentDate: "Payment date",
          reference: "Reference",
          issuedBy: "Received / issued by",
          issuedAt: "Issued at",
          status: "Receipt status",
          issued: "Valid",
          reversed: "Reversed / accounting void",
          reversedNotice:
            "The payment linked to this receipt was reversed. The receipt is retained for audit purposes and is not proof of an active payment.",
          noAmount: "Registration evidence — no financial amount",
          registration: "Student registration confirmation",
          original: "Official QuranOS copy",
          noValue: "—",
        };

  const dateLocale = locale === "ar" ? "ar-DZ" : "en-GB";
  const formatDate = (value: string | null) => {
    if (!value) return copy.noValue;
    const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(dateLocale, {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          ...(value.includes("T") ? { hour: "2-digit", minute: "2-digit" } : {}),
        }).format(date);
  };

  const paymentMethod = receipt.paymentMethod
    ? paymentMethodLabels[locale][
        receipt.paymentMethod as keyof (typeof paymentMethodLabels)["ar"]
      ] ?? receipt.paymentMethod
    : copy.noValue;
  const chargeType = receipt.chargeType
    ? chargeTypeLabels[locale][
        receipt.chargeType as keyof (typeof chargeTypeLabels)["ar"]
      ] ?? receipt.chargeType
    : null;
  const description =
    receipt.receiptType === "registration"
      ? copy.registration
      : receipt.description ?? chargeType ?? copy.noValue;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95vh] max-w-3xl overflow-y-auto bg-white p-0" dir={direction}>
        <DialogHeader className="print:hidden px-6 pt-6">
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            {copy.number}: {receipt.receiptNumber}
          </DialogDescription>
        </DialogHeader>

        <style>{`@media print {
          body * { visibility: hidden !important; }
          #official-receipt-document, #official-receipt-document * { visibility: visible !important; }
          #official-receipt-document { position: absolute !important; inset: 0 !important; width: 100% !important; padding: 18mm !important; background: white !important; }
          .receipt-no-print { display: none !important; }
          @page { size: A4; margin: 0; }
        }`}</style>

        <article
          id="official-receipt-document"
          className="m-6 rounded-2xl border-2 border-[#0B4738] bg-white p-6 text-[#20352E] print:m-0 print:rounded-none"
          dir={direction}
        >
          <header className="border-b-2 border-[#C8A26A] pb-5 text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-[#0B4738] text-xl font-black text-white">
              ق
            </div>
            <h1 className="text-2xl font-black text-[#0B4738]">{receipt.schoolName}</h1>
            <p className="mt-1 text-sm text-gray-600">{receipt.branchName}</p>
            <h2 className="mt-4 text-xl font-bold">{copy.title}</h2>
            <p className="mt-1 font-mono text-sm font-bold tracking-wide text-[#9A7137]">
              {receipt.receiptNumber}
            </p>
          </header>

          {receipt.receiptStatus === "reversed" && (
            <section className="my-5 rounded-xl border-2 border-red-300 bg-red-50 p-4 text-center text-sm font-bold leading-6 text-red-800">
              <div className="mb-1 flex items-center justify-center gap-2 text-base">
                <XCircle size={20} />
                {copy.reversed}
              </div>
              {copy.reversedNotice}
            </section>
          )}

          <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            <div><dt className="text-xs font-semibold text-gray-500">{copy.student}</dt><dd className="mt-1 font-bold">{receipt.studentName}</dd></div>
            <div><dt className="text-xs font-semibold text-gray-500">{copy.guardian}</dt><dd className="mt-1 font-semibold">{receipt.guardianName ?? copy.noValue}</dd></div>
            {receipt.receiptType === "registration" && (
              <div><dt className="text-xs font-semibold text-gray-500">{copy.enrollment}</dt><dd className="mt-1 font-semibold">{formatDate(receipt.enrollmentStartDate)}</dd></div>
            )}
            <div><dt className="text-xs font-semibold text-gray-500">{copy.description}</dt><dd className="mt-1 font-semibold">{description}</dd></div>
            {receipt.receiptType === "payment" && (
              <>
                <div><dt className="text-xs font-semibold text-gray-500">{copy.amount}</dt><dd className="mt-1 text-lg font-black text-[#0B4738]">{receipt.amount === null ? copy.noValue : formatDzd(receipt.amount)}</dd></div>
                <div className="sm:col-span-2"><dt className="text-xs font-semibold text-gray-500">{copy.amountWords}</dt><dd className="mt-1 font-semibold leading-7">{receipt.amount === null ? copy.noValue : amountToWords(receipt.amount, locale)}</dd></div>
                <div><dt className="text-xs font-semibold text-gray-500">{copy.method}</dt><dd className="mt-1 font-semibold">{paymentMethod}</dd></div>
                <div><dt className="text-xs font-semibold text-gray-500">{copy.paymentDate}</dt><dd className="mt-1 font-semibold">{formatDate(receipt.paymentDate)}</dd></div>
                <div><dt className="text-xs font-semibold text-gray-500">{copy.reference}</dt><dd className="mt-1 font-mono text-sm">{receipt.paymentReference ?? copy.noValue}</dd></div>
              </>
            )}
          </dl>

          {receipt.receiptType === "registration" && (
            <div className="mt-6 rounded-xl bg-[#F7F8F3] p-4 text-center font-semibold text-[#0B4738]">
              {copy.noAmount}
            </div>
          )}

          <footer className="mt-8 grid grid-cols-1 gap-4 border-t border-gray-200 pt-5 text-sm sm:grid-cols-2">
            <div><span className="text-gray-500">{copy.issuedBy}: </span><strong>{receipt.issuerName}</strong></div>
            <div><span className="text-gray-500">{copy.issuedAt}: </span><strong>{formatDate(receipt.issuedAt)}</strong></div>
            <div><span className="text-gray-500">{copy.status}: </span><strong className={receipt.receiptStatus === "reversed" ? "text-red-700" : "text-emerald-700"}>{receipt.receiptStatus === "reversed" ? copy.reversed : copy.issued}</strong></div>
            <div className="text-gray-500 sm:text-end">{copy.original}</div>
          </footer>
        </article>

        <div className="receipt-no-print flex justify-end gap-3 border-t bg-gray-50 px-6 py-4">
          <Button type="button" onClick={() => window.print()} className="gap-2 bg-[#0B4738] text-white hover:bg-[#08382d]">
            <Printer size={17} />
            {copy.print}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
