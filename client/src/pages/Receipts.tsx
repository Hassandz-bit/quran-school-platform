import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, FileText, Printer, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import OfficialReceiptDialog from "@/components/OfficialReceiptDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { formatDzd } from "@/lib/finance";
import { buildPaymentLedgerRows, fetchPaymentPageData } from "@/lib/payments";
import {
  fetchOfficialReceipt,
  fetchOfficialReceiptAccess,
  getReceiptErrorMessage,
  issuePaymentReceipt,
  issueRegistrationReceipt,
  listOfficialReceipts,
  listRegistrationReceiptStudents,
  type OfficialReceipt,
  type OfficialReceiptAccess,
  type OfficialReceiptListItem,
  type RegistrationReceiptStudent,
} from "@/lib/receipts";

type LoadState = "loading" | "ready" | "error" | "forbidden";
type PaymentIssueOption = {
  paymentId: string;
  studentName: string;
  amount: number;
  paymentDate: string;
  status: "completed" | "reversed";
};

const emptyAccess: OfficialReceiptAccess = {
  canViewPaymentReceipts: false,
  canIssuePaymentReceipts: false,
  canIssueRegistrationReceipts: false,
};

export default function Receipts() {
  const { school } = useAuth();
  const { locale, direction } = useLocale();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [access, setAccess] = useState<OfficialReceiptAccess>(emptyAccess);
  const [receipts, setReceipts] = useState<OfficialReceiptListItem[]>([]);
  const [students, setStudents] = useState<RegistrationReceiptStudent[]>([]);
  const [paymentOptions, setPaymentOptions] = useState<PaymentIssueOption[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "payment" | "registration">("all");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedPaymentId, setSelectedPaymentId] = useState("");
  const [issuingStudentId, setIssuingStudentId] = useState<string | null>(null);
  const [issuingPaymentId, setIssuingPaymentId] = useState<string | null>(null);
  const [loadingReceiptId, setLoadingReceiptId] = useState<string | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<OfficialReceipt | null>(null);

  const copy = locale === "ar"
    ? {
        title: "الوصولات الرسمية",
        subtitle: "إصدار وإعادة طباعة وصولات التسجيل والدفع دون تغيير رقم الوصل الأصلي.",
        loading: "جارٍ تحميل الوصولات...",
        loadError: "تعذر تحميل مركز الوصولات حاليًا.",
        retry: "إعادة المحاولة",
        forbidden: "لا تملك صلاحية الوصول إلى الوصولات الرسمية.",
        paymentTitle: "إصدار وصل دفع",
        paymentHint: "اختر دفعة مسجلة. إذا كان لها وصل سابق فسيُعاد نفس الوصل ونفس الرقم.",
        choosePayment: "اختر الدفعة",
        issuePayment: "إصدار وصل الدفع",
        paymentIssued: "تم تجهيز وصل الدفع الرسمي.",
        registrationTitle: "إصدار وصل تسجيل",
        registrationHint: "يُصدر مرة واحدة لتاريخ التسجيل الحالي، وإعادة الإصدار تعيد نفس الوصل.",
        chooseStudent: "اختر الطالب",
        issueRegistration: "إصدار وصل التسجيل",
        issuing: "جارٍ الإصدار...",
        registrationIssued: "تم تجهيز وصل التسجيل الرسمي.",
        search: "بحث برقم الوصل أو اسم الطالب أو الفرع...",
        allTypes: "كل الوصولات",
        payment: "دفع",
        registration: "تسجيل",
        completed: "مكتملة",
        paymentReversed: "معكوسة",
        number: "رقم الوصل",
        student: "الطالب",
        branch: "الفرع",
        type: "النوع",
        amount: "المبلغ",
        date: "تاريخ الإصدار",
        status: "الحالة",
        action: "الإجراء",
        valid: "صالح",
        reversed: "معكوس",
        print: "عرض / طباعة",
        noReceipts: "لا توجد وصولات رسمية مطابقة بعد.",
        noAmount: "دون مبلغ",
      }
    : {
        title: "Official Receipts",
        subtitle: "Issue and reprint registration and payment receipts without changing the original receipt number.",
        loading: "Loading receipts...",
        loadError: "The receipt center could not be loaded.",
        retry: "Try again",
        forbidden: "You do not have access to official receipts.",
        paymentTitle: "Issue payment receipt",
        paymentHint: "Choose a recorded payment. If it already has a receipt, the same receipt number is returned.",
        choosePayment: "Choose payment",
        issuePayment: "Issue payment receipt",
        paymentIssued: "The official payment receipt is ready.",
        registrationTitle: "Issue registration receipt",
        registrationHint: "Issued once for the current registration date; repeating the action returns the same receipt.",
        chooseStudent: "Choose student",
        issueRegistration: "Issue registration receipt",
        issuing: "Issuing...",
        registrationIssued: "The official registration receipt is ready.",
        search: "Search by receipt number, student, or branch...",
        allTypes: "All receipts",
        payment: "Payment",
        registration: "Registration",
        completed: "Completed",
        paymentReversed: "Reversed",
        number: "Receipt no.",
        student: "Student",
        branch: "Branch",
        type: "Type",
        amount: "Amount",
        date: "Issued at",
        status: "Status",
        action: "Action",
        valid: "Valid",
        reversed: "Reversed",
        print: "View / print",
        noReceipts: "No matching official receipts yet.",
        noAmount: "No amount",
      };

  const load = useCallback(async () => {
    if (!school?.id) {
      setLoadState("error");
      return;
    }
    setLoadState("loading");
    try {
      const receiptAccess = await fetchOfficialReceiptAccess(school.id);
      setAccess(receiptAccess);
      const hasAccess =
        receiptAccess.canViewPaymentReceipts ||
        receiptAccess.canIssuePaymentReceipts ||
        receiptAccess.canIssueRegistrationReceipts;
      if (!hasAccess) {
        setReceipts([]);
        setStudents([]);
        setPaymentOptions([]);
        setLoadState("forbidden");
        return;
      }

      const [receiptRows, studentRows, paymentPage] = await Promise.all([
        listOfficialReceipts(school.id),
        receiptAccess.canIssueRegistrationReceipts
          ? listRegistrationReceiptStudents(school.id)
          : Promise.resolve([]),
        receiptAccess.canIssuePaymentReceipts
          ? fetchPaymentPageData(school.id)
          : Promise.resolve(null),
      ]);
      setReceipts(receiptRows);
      setStudents(studentRows);

      if (paymentPage) {
        const studentsById = new Map(
          paymentPage.students.map(student => [
            student.id,
            `${student.first_name} ${student.last_name}`.trim(),
          ])
        );
        setPaymentOptions(
          buildPaymentLedgerRows(paymentPage.charges, paymentPage.payments).map(row => ({
            paymentId: row.payment.id,
            studentName: studentsById.get(row.payment.student_id) ?? "—",
            amount: Number(row.payment.amount),
            paymentDate: row.payment.payment_date,
            status: row.payment.status,
          }))
        );
      } else {
        setPaymentOptions([]);
      }
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, [school?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredReceipts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return receipts.filter(receipt => {
      const searchable = [
        receipt.receiptNumber,
        receipt.studentName,
        receipt.branchName,
        receipt.description ?? "",
      ].join(" ").toLocaleLowerCase();
      return (
        (typeFilter === "all" || receipt.receiptType === typeFilter) &&
        (query === "" || searchable.includes(query))
      );
    });
  }, [receipts, search, typeFilter]);

  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "en-GB", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(date);
  };

  const openReceipt = async (receiptId: string) => {
    setLoadingReceiptId(receiptId);
    try {
      const receipt = await fetchOfficialReceipt(receiptId);
      setActiveReceipt(receipt);
    } catch (error) {
      toast.error(getReceiptErrorMessage(error, locale));
    } finally {
      setLoadingReceiptId(null);
    }
  };

  const issuePayment = async () => {
    if (!selectedPaymentId || !access.canIssuePaymentReceipts) return;
    setIssuingPaymentId(selectedPaymentId);
    try {
      const receipt = await issuePaymentReceipt(selectedPaymentId);
      setActiveReceipt(receipt);
      toast.success(copy.paymentIssued);
      setSelectedPaymentId("");
      await load();
    } catch (error) {
      toast.error(getReceiptErrorMessage(error, locale));
    } finally {
      setIssuingPaymentId(null);
    }
  };

  const issueRegistration = async () => {
    if (!selectedStudentId || !access.canIssueRegistrationReceipts) return;
    setIssuingStudentId(selectedStudentId);
    try {
      const receipt = await issueRegistrationReceipt(selectedStudentId);
      setActiveReceipt(receipt);
      toast.success(copy.registrationIssued);
      setSelectedStudentId("");
      await load();
    } catch (error) {
      toast.error(getReceiptErrorMessage(error, locale));
    } finally {
      setIssuingStudentId(null);
    }
  };

  if (loadState === "loading") {
    return (
      <Card className="p-10 text-center text-gray-500" dir={direction}>
        <RefreshCw className="mx-auto mb-3 animate-spin" size={24} />
        {copy.loading}
      </Card>
    );
  }

  if (loadState === "error" || loadState === "forbidden") {
    return (
      <Card className="p-10 text-center" dir={direction}>
        <p className={loadState === "forbidden" ? "text-amber-700" : "text-red-700"}>
          {loadState === "forbidden" ? copy.forbidden : copy.loadError}
        </p>
        {loadState === "error" && (
          <Button variant="outline" className="mt-4 gap-2" onClick={() => void load()}>
            <RefreshCw size={16} /> {copy.retry}
          </Button>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-6" dir={direction}>
      <header>
        <h1 className="text-2xl font-black text-[#173B2D]">{copy.title}</h1>
        <p className="mt-1 text-sm leading-6 text-gray-600">{copy.subtitle}</p>
      </header>

      <div className="grid gap-4 xl:grid-cols-2">
        {access.canIssuePaymentReceipts && (
          <Card className="border border-[#0B4738]/20 p-5">
            <h2 className="font-bold text-[#173B2D]">{copy.paymentTitle}</h2>
            <p className="mt-1 text-sm text-gray-500">{copy.paymentHint}</p>
            <div className="mt-4 flex flex-col gap-3">
              <select
                value={selectedPaymentId}
                onChange={event => setSelectedPaymentId(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"
              >
                <option value="">{copy.choosePayment}</option>
                {paymentOptions.map(payment => (
                  <option key={payment.paymentId} value={payment.paymentId}>
                    {payment.studentName} — {formatDzd(payment.amount)} — {payment.paymentDate} — {payment.status === "reversed" ? copy.paymentReversed : copy.completed}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                disabled={!selectedPaymentId || issuingPaymentId !== null}
                onClick={() => void issuePayment()}
                className="min-h-11 gap-2 bg-[#0B4738] text-white hover:bg-[#08382d]"
              >
                <Banknote size={17} />
                {issuingPaymentId ? copy.issuing : copy.issuePayment}
              </Button>
            </div>
          </Card>
        )}

        {access.canIssueRegistrationReceipts && (
          <Card className="border border-[#C8A26A]/30 p-5">
            <h2 className="font-bold text-[#173B2D]">{copy.registrationTitle}</h2>
            <p className="mt-1 text-sm text-gray-500">{copy.registrationHint}</p>
            <div className="mt-4 flex flex-col gap-3">
              <select
                value={selectedStudentId}
                onChange={event => setSelectedStudentId(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"
              >
                <option value="">{copy.chooseStudent}</option>
                {students.map(student => (
                  <option key={student.studentId} value={student.studentId}>
                    {student.studentName} — {student.enrollmentStartDate}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                disabled={!selectedStudentId || issuingStudentId !== null}
                onClick={() => void issueRegistration()}
                className="min-h-11 gap-2 bg-[#0B4738] text-white hover:bg-[#08382d]"
              >
                <FileText size={17} />
                {issuingStudentId ? copy.issuing : copy.issueRegistration}
              </Button>
            </div>
          </Card>
        )}
      </div>

      <Card className="border border-gray-100 p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
          <div className="relative">
            <Search
              size={18}
              className={`absolute top-1/2 -translate-y-1/2 text-gray-400 ${direction === "rtl" ? "right-3" : "left-3"}`}
            />
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder={copy.search}
              className={direction === "rtl" ? "pr-10" : "pl-10"}
            />
          </div>
          <select
            value={typeFilter}
            onChange={event => setTypeFilter(event.target.value as typeof typeFilter)}
            className="min-h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm"
          >
            <option value="all">{copy.allTypes}</option>
            <option value="payment">{copy.payment}</option>
            <option value="registration">{copy.registration}</option>
          </select>
        </div>
      </Card>

      {filteredReceipts.length === 0 ? (
        <Card className="p-10 text-center text-gray-500">{copy.noReceipts}</Card>
      ) : (
        <Card className="overflow-hidden border border-gray-100">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b bg-gray-50 text-gray-500">
                <tr>
                  {[copy.number, copy.student, copy.branch, copy.type, copy.amount, copy.date, copy.status, copy.action].map(label => (
                    <th key={label} className="px-4 py-3 text-start font-semibold">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredReceipts.map(receipt => (
                  <tr key={receipt.receiptId} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-mono font-bold text-[#0B4738]">{receipt.receiptNumber}</td>
                    <td className="px-4 py-3 font-semibold">{receipt.studentName}</td>
                    <td className="px-4 py-3 text-gray-600">{receipt.branchName}</td>
                    <td className="px-4 py-3">{receipt.receiptType === "payment" ? copy.payment : copy.registration}</td>
                    <td className="px-4 py-3 font-semibold">{receipt.amount === null ? copy.noAmount : formatDzd(receipt.amount)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(receipt.issuedAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${receipt.receiptStatus === "reversed" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                        {receipt.receiptStatus === "reversed" ? copy.reversed : copy.valid}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        disabled={loadingReceiptId === receipt.receiptId}
                        onClick={() => void openReceipt(receipt.receiptId)}
                      >
                        {loadingReceiptId === receipt.receiptId ? <RefreshCw size={15} className="animate-spin" /> : <Printer size={15} />}
                        {copy.print}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <OfficialReceiptDialog
        receipt={activeReceipt}
        open={Boolean(activeReceipt)}
        onOpenChange={open => {
          if (!open) setActiveReceipt(null);
        }}
      />
    </div>
  );
}
