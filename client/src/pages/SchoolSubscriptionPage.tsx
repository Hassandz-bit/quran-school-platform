import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { CreditCard, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { getSupabaseClient } from "@/lib/supabase";

type Subscription = {
  id: string; plan_name_snapshot: string; status: string; starts_at: string | null;
  ends_at: string | null; trial_ends_at: string | null; grace_ends_at: string | null;
  max_active_students: number | null; max_active_branches: number | null;
  agreed_annual_price: number | null; currency_code: string;
};
type RenewalRequest = { id: string; status: string; message: string | null; review_note: string | null; created_at: string };
type Payment = { id: string; amount: number; currency_code: string; paid_at: string; payment_method: string; reference: string | null };
type Reminder = { id: string; reminder_type: "trial" | "subscription"; reminder_days: number; due_at: string; created_at: string };

export default function SchoolSubscriptionPage() {
  const { user, school, isSchoolAdmin } = useAuth();
  const { locale, direction } = useLocale();
  const ar = locale === "ar";
  const client = getSupabaseClient();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [request, setRequest] = useState<RenewalRequest | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!school?.id) { setLoading(false); return; }
    setLoading(true);
    const [subResult, requestResult, reminderResult] = await Promise.all([
      client.from("school_subscriptions").select("id,plan_name_snapshot,status,starts_at,ends_at,trial_ends_at,grace_ends_at,max_active_students,max_active_branches,agreed_annual_price,currency_code").eq("school_id", school.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      client.from("school_subscription_renewal_requests").select("id,status,message,review_note,created_at").eq("school_id", school.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      client.from("school_subscription_reminders").select("id,reminder_type,reminder_days,due_at,created_at").eq("school_id", school.id).order("due_at", { ascending: true }),
    ]);
    if (subResult.error) setError(subResult.error.message);
    else setSubscription(subResult.data as Subscription | null);
    if (requestResult.error) setError(requestResult.error.message);
    else setRequest(requestResult.data as RenewalRequest | null);
    if (reminderResult.error) setError(reminderResult.error.message);
    else {
      const currentEnd = subResult.data?.trial_ends_at ?? subResult.data?.ends_at;
      const rows = (reminderResult.data ?? []) as Reminder[];
      setReminders(rows.filter(item => currentEnd && Date.parse(item.due_at) === Date.parse(currentEnd)));
    }
    if (subResult.data?.id) {
      const paymentResult = await client.from("subscription_payments").select("id,amount,currency_code,paid_at,payment_method,reference").eq("subscription_id", subResult.data.id).order("paid_at", { ascending: false });
      if (!paymentResult.error) setPayments((paymentResult.data ?? []) as Payment[]);
    }
    setLoading(false);
  }, [client, school?.id]);

  useEffect(() => { void load(); }, [load]);

  const requestRenewal = async () => {
    if (!school?.id || !user?.id) return;
    setBusy(true); setError(""); setNotice("");
    const { error: insertError } = await client.from("school_subscription_renewal_requests").insert({
      school_id: school.id, requested_by: user.id, message: message.trim() || null, status: "pending",
    });
    if (insertError) {
      setError(insertError.code === "23505"
        ? (ar ? "يوجد طلب تجديد قيد المراجعة بالفعل." : "A renewal request is already pending.")
        : insertError.message);
    } else {
      setNotice(ar ? "أُرسل طلب التجديد إلى إدارة المنصة." : "Your renewal request was sent to the platform owner.");
      setMessage("");
      await load();
    }
    setBusy(false);
  };

  const date = (value: string | null) => value ? new Date(value).toLocaleDateString(ar ? "ar-DZ-u-nu-latn" : "en-GB") : "—";
  const endDate = subscription?.trial_ends_at ?? subscription?.ends_at;
  const daysLeft = endDate ? Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000) : null;
  const labels: Record<string, string> = ar ? {
    legacy: "اشتراك سابق", trial: "فترة تجريبية", active: "نشط", grace: "فترة سماح",
    expired: "منتهٍ", suspended: "موقوف", cancelled: "ملغى",
  } : {
    legacy: "Legacy", trial: "Trial", active: "Active", grace: "Grace period",
    expired: "Expired", suspended: "Suspended", cancelled: "Cancelled",
  };
  const paymentMethod = (method: string) => {
    const methods: Record<string, string> = {
      ccp: ar ? "بريد الجزائر" : "CCP",
      cash: ar ? "نقدًا" : "Cash",
      bank_transfer: ar ? "تحويل بنكي" : "Bank transfer",
      cheque: ar ? "صك" : "Cheque",
      other: ar ? "أخرى" : "Other",
    };
    return methods[method] ?? method;
  };

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center" dir={direction}><Loader2 className="animate-spin" /></div>;
  if (school && !isSchoolAdmin) return <main dir={direction} className="p-8 text-center text-sm text-slate-600">{ar ? "الوصول غير مسموح" : "Subscription details are available to the school administrator only."}</main>;
  if (!school) return <main dir={direction} className="p-8 text-center"><p>{ar ? "لا توجد مدرسة مرتبطة بهذا الحساب." : "No school is linked to this account."}</p><Link href="/school-registration" className="mt-3 inline-block text-[#17663B] underline">{ar ? "تسجيل مدرسة" : "Register a school"}</Link></main>;

  return <main dir={direction} className="mx-auto max-w-5xl space-y-5 p-4 py-8 text-[#173B2D]">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-extrabold">{ar ? "اشتراك المدرسة" : "School subscription"}</h1><p className="mt-1 text-sm text-slate-500">{school.name}</p></div>
      <Button variant="outline" onClick={() => void load()}><RefreshCw size={16} className="me-2"/>{ar ? "تحديث" : "Refresh"}</Button>
    </header>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2"><ShieldCheck className="text-[#17663B]"/><h2 className="font-bold">{ar ? "حالة الاشتراك" : "Subscription status"}</h2></div>
      {subscription ? <>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-xs text-slate-500">{ar ? "الباقة" : "Plan"}</p><p className="mt-1 font-bold">{subscription.plan_name_snapshot}</p></div>
          <div><p className="text-xs text-slate-500">{ar ? "الحالة" : "Status"}</p><p className="mt-1 font-bold">{labels[subscription.status] ?? subscription.status}</p></div>
          <div><p className="text-xs text-slate-500">{ar ? "نهاية الاشتراك / التجربة" : "Subscription / trial end"}</p><p className="mt-1 font-bold">{date(endDate)}</p></div>
          <div><p className="text-xs text-slate-500">{ar ? "المتبقي" : "Remaining"}</p><p className="mt-1 font-bold">{daysLeft === null ? "—" : daysLeft < 0 ? (ar ? "انتهى" : "Expired") : `${daysLeft} ${ar ? "يومًا" : "days"}`}</p></div>
          <div><p className="text-xs text-slate-500">{ar ? "حد التلاميذ" : "Student limit"}</p><p className="mt-1 font-bold">{subscription.max_active_students ?? "∞"}</p></div>
          <div><p className="text-xs text-slate-500">{ar ? "حد الفروع" : "Branch limit"}</p><p className="mt-1 font-bold">{subscription.max_active_branches ?? "∞"}</p></div>
          <div><p className="text-xs text-slate-500">{ar ? "نهاية السماح" : "Grace period ends"}</p><p className="mt-1 font-bold">{date(subscription.grace_ends_at)}</p></div>
          <div><p className="text-xs text-slate-500">{ar ? "السعر السنوي" : "Annual price"}</p><p className="mt-1 font-bold">{subscription.agreed_annual_price?.toLocaleString(ar ? "en-US" : "en-GB")} {subscription.currency_code}</p></div>
        </div>
      </> : <p className="mt-3 text-sm text-slate-500">{ar ? "لم يُسجل اشتراك لهذه المدرسة بعد. تواصل مع إدارة المنصة." : "No subscription has been recorded yet. Contact the platform owner."}</p>}
      {subscription && ["expired", "suspended", "cancelled"].includes(subscription.status) && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{ar ? "البيانات محفوظة. قد تكون عمليات الإضافة والتعديل مقيدة حتى تجديد الاشتراك." : "Your data is preserved. Create and update operations may be restricted until renewal."}</p>}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-bold">{ar ? "تنبيهات انتهاء الاشتراك" : "Expiry reminders"}</h2>
      {reminders.length ? <ul className="mt-3 space-y-2">{reminders.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><span>{item.reminder_type === "trial" ? (ar ? "انتهاء الفترة التجريبية" : "Trial ending") : (ar ? "انتهاء الاشتراك السنوي" : "Annual subscription ending")} — {item.reminder_days} {ar ? "يومًا" : "days"}</span><strong>{date(item.due_at)}</strong></li>)}</ul> : <p className="mt-2 text-sm text-slate-500">{ar ? "ستظهر هنا تنبيهات 30 و7 أيام قبل تاريخ الانتهاء." : "30-day and 7-day reminders will appear here before the expiry date."}</p>}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2"><CreditCard className="text-[#17663B]"/><h2 className="font-bold">{ar ? "طلب التجديد" : "Renewal request"}</h2></div>
      {request?.status === "pending" ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{ar ? "يوجد طلب تجديد قيد المراجعة. ستتواصل معكم إدارة المنصة." : "A renewal request is pending. The platform owner will contact you."}</p> : <>
        {request?.review_note && <p className="mt-3 text-sm text-slate-600">{request.review_note}</p>}
        <label className="mt-3 block text-sm font-semibold">{ar ? "رسالة لإدارة المنصة (اختياري)" : "Message to the platform owner (optional)"}
          <textarea value={message} onChange={e=>setMessage(e.target.value)} className="mt-1 min-h-20 w-full rounded-xl border p-3 text-sm"/>
        </label>
        <Button className="mt-3 bg-[#17663B]" disabled={!isSchoolAdmin || busy} onClick={() => void requestRenewal()}>{busy ? (ar ? "جارٍ الإرسال..." : "Sending...") : (ar ? "إرسال طلب التجديد" : "Request renewal")}</Button>
        {!isSchoolAdmin && <p className="mt-2 text-xs text-slate-500">{ar ? "يمكن لمدير المدرسة إرسال طلب التجديد." : "Only the school administrator can request renewal."}</p>}
      </>}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-bold">{ar ? "سجل المدفوعات" : "Payment history"}</h2>
      {payments.length ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead><tr className="border-b text-right text-slate-500"><th className="p-2">{ar ? "التاريخ" : "Date"}</th><th className="p-2">{ar ? "المبلغ" : "Amount"}</th><th className="p-2">{ar ? "الطريقة" : "Method"}</th><th className="p-2">{ar ? "المرجع" : "Reference"}</th></tr></thead><tbody>{payments.map(payment=><tr key={payment.id} className="border-b last:border-0"><td className="p-2">{date(payment.paid_at)}</td><td className="p-2 font-semibold">{payment.amount.toLocaleString("en-US")} {payment.currency_code}</td><td className="p-2">{paymentMethod(payment.payment_method)}</td><td className="p-2">{payment.reference ?? "—"}</td></tr>)}</tbody></table></div> : <p className="mt-3 text-sm text-slate-500">{ar ? "لا توجد مدفوعات مسجلة." : "No payments recorded."}</p>}
    </section>
  </main>;
}
