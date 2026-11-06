import { useCallback, useEffect, useState, type FormEvent } from "react";
import { RefreshCw, Plus, CheckCircle2, XCircle, CreditCard, Settings2, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseClient } from "@/lib/supabase";

type Plan = {
  id: string; code: string; name_ar: string; max_active_students: number;
  max_active_branches: number; annual_price: number; currency_code: string; is_active: boolean;
};
type RegistrationRequest = {
  id: string; applicant_profile_id: string; school_name: string; slug: string;
  contact_phone: string | null; contact_email: string | null; address: string | null;
  applicant_note: string | null; created_at: string;
};
type Subscription = {
  id: string; school_id: string; plan_id: string | null; plan_name_snapshot: string; status: string;
  starts_at: string | null; ends_at: string | null; trial_ends_at: string | null; grace_ends_at: string | null;
  max_active_students: number | null; max_active_branches: number | null;
  agreed_annual_price: number | null; currency_code: string;
};
type PlanDraft = { name_ar: string; max_active_students: string; max_active_branches: string; annual_price: string; currency_code: string };
type SchoolName = { id: string; name: string };
type RenewalRequest = { id: string; school_id: string; requested_by: string; message: string | null; created_at: string };
type AuditRow = { id: number; actor_user_id: string | null; action: string; entity_type: string; created_at: string };

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#17663B] focus:ring-2 focus:ring-[#17663B]/10";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-xl bg-[#17663B] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#12532f] disabled:cursor-not-allowed disabled:opacity-50";
const cardClass = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";

export default function PlatformOwnerDashboard() {
  const { user, signOut } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planEdits, setPlanEdits] = useState<Record<string, PlanDraft>>({});
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [renewalRequests, setRenewalRequests] = useState<RenewalRequest[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [schools, setSchools] = useState<Record<string, string>>({});
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [settings, setSettings] = useState({ trial_default_days: 14, grace_period_days: 7, default_currency_code: "DZD" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [planForm, setPlanForm] = useState({ code: "", name_ar: "", max_active_students: "", max_active_branches: "", annual_price: "", currency_code: "DZD" });
  const [approval, setApproval] = useState<Record<string, { planId: string; trialDays: string; discount: string }>>({});
  const [renewal, setRenewal] = useState<Record<string, { planId: string; amount: string; method: string; reference: string }>>({});
  const [trialExtensions, setTrialExtensions] = useState<Record<string, string>>({});
  const [subscriptionExtensions, setSubscriptionExtensions] = useState<Record<string, string>>({});
  const client = getSupabaseClient();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [planResult, requestResult, subscriptionResult, settingsResult, auditResult, renewalRequestResult] = await Promise.all([
        client.from("subscription_plans").select("id,code,name_ar,max_active_students,max_active_branches,annual_price,currency_code,is_active").order("annual_price"),
        client.from("school_registration_requests").select("id,applicant_profile_id,school_name,slug,contact_phone,contact_email,address,applicant_note,created_at").eq("status", "pending").order("created_at", { ascending: false }),
        client.from("school_subscriptions").select("id,school_id,plan_id,plan_name_snapshot,status,starts_at,ends_at,trial_ends_at,grace_ends_at,max_active_students,max_active_branches,agreed_annual_price,currency_code").order("created_at", { ascending: false }),
        client.from("platform_settings").select("trial_default_days,grace_period_days,default_currency_code").eq("singleton", true).maybeSingle(),
        client.from("platform_audit_log").select("id,actor_user_id,action,entity_type,created_at").order("created_at", { ascending: false }).limit(20),
        client.from("school_subscription_renewal_requests").select("id,school_id,requested_by,message,created_at").eq("status", "pending").order("created_at", { ascending: false }),
      ]);
      for (const result of [planResult, requestResult, subscriptionResult, settingsResult, auditResult, renewalRequestResult]) {
        if (result.error) throw result.error;
      }
      const nextPlans = (planResult.data ?? []) as Plan[];
      const nextRequests = (requestResult.data ?? []) as RegistrationRequest[];
      const nextSubscriptions = (subscriptionResult.data ?? []) as Subscription[];
      const nextRenewalRequests = (renewalRequestResult.data ?? []) as RenewalRequest[];
      setPlans(nextPlans);
      setPlanEdits(current => {
        const next = { ...current };
        for (const plan of nextPlans) {
          if (!next[plan.id]) next[plan.id] = {
            name_ar: plan.name_ar,
            max_active_students: String(plan.max_active_students),
            max_active_branches: String(plan.max_active_branches),
            annual_price: String(plan.annual_price),
            currency_code: plan.currency_code,
          };
        }
        return next;
      });
      setRequests(nextRequests);
      setRenewalRequests(nextRenewalRequests);
      setSubscriptions(nextSubscriptions);
      setSubscriptionExtensions(current => {
        const next = { ...current };
        for (const subscription of nextSubscriptions) {
          if (subscription.ends_at && !next[subscription.id]) {
            next[subscription.id] = new Date(subscription.ends_at).toISOString().slice(0, 10);
          }
        }
        return next;
      });
      setTrialExtensions(current => {
        const next = { ...current };
        for (const subscription of nextSubscriptions) {
          if (subscription.trial_ends_at && !next[subscription.id]) {
            next[subscription.id] = new Date(subscription.trial_ends_at).toISOString().slice(0, 10);
          }
        }
        return next;
      });
      if (settingsResult.data) setSettings(settingsResult.data as typeof settings);
      const schoolIds = [...new Set([...nextSubscriptions.map(item => item.school_id), ...nextRenewalRequests.map(item => item.school_id)])];
      if (schoolIds.length) {
        const schoolResult = await client.from("schools").select("id,name").in("id", schoolIds);
        if (schoolResult.error) throw schoolResult.error;
        setSchools(Object.fromEntries(((schoolResult.data ?? []) as SchoolName[]).map(item => [item.id, item.name])));
      } else setSchools({});
      setAudit((auditResult.data ?? []) as AuditRow[]);
      const firstActivePlan = nextPlans.find(plan => plan.is_active);
      const defaultTrialDays = settingsResult.data?.trial_default_days ?? settings.trial_default_days;
      setApproval(current => {
        const next = { ...current };
        for (const request of nextRequests) {
          const existing = next[request.id];
          const selectedPlan = nextPlans.find(plan => plan.id === existing?.planId && plan.is_active) ?? firstActivePlan;
          next[request.id] = {
            planId: selectedPlan?.id ?? "",
            trialDays: existing?.trialDays ?? String(defaultTrialDays),
            discount: existing?.discount ?? "0",
          };
        }
        return next;
      });
      setRenewal(current => {
        const next = { ...current };
        for (const subscription of nextSubscriptions) {
          const existing = next[subscription.id];
          const selectedPlan = nextPlans.find(plan => plan.id === existing?.planId && plan.is_active)
            ?? nextPlans.find(plan => plan.id === subscription.plan_id && plan.is_active)
            ?? firstActivePlan;
          next[subscription.id] = {
            planId: selectedPlan?.id ?? "",
            amount: existing && selectedPlan?.id === existing.planId
              ? existing.amount
              : String(selectedPlan?.annual_price ?? 0),
            method: existing?.method ?? "ccp",
            reference: existing?.reference ?? "",
          };
        }
        return next;
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحميل بيانات الاشتراكات.");
    } finally {
      setLoading(false);
    }
  }, [client, settings.trial_default_days]);

  useEffect(() => { void reload(); }, [reload]);

  const createPlan = async (event: FormEvent) => {
    event.preventDefault();
    const code = planForm.code.trim().toLowerCase().replace(/\s+/g, "-");
    if (!/^[a-z][a-z0-9_-]*$/.test(code)
      || !Number.isInteger(Number(planForm.max_active_students)) || Number(planForm.max_active_students) < 1
      || !Number.isInteger(Number(planForm.max_active_branches)) || Number(planForm.max_active_branches) < 1
      || !Number.isFinite(Number(planForm.annual_price)) || Number(planForm.annual_price) < 0
      || !/^[A-Z]{3}$/.test(planForm.currency_code.toUpperCase())) {
      toast.error("تحقق من رمز الباقة والحدود والسعر والعملة.");
      return;
    }
    setBusy("plan");
    try {
      const { error } = await client.from("subscription_plans").insert({
        code,
        name_ar: planForm.name_ar.trim(),
        max_active_students: Number(planForm.max_active_students),
        max_active_branches: Number(planForm.max_active_branches),
        annual_price: Number(planForm.annual_price),
        currency_code: planForm.currency_code.toUpperCase(),
        is_active: true,
      });
      if (error) throw error;
      toast.success("تم إنشاء الباقة.");
      setPlanForm({ code: "", name_ar: "", max_active_students: "", max_active_branches: "", annual_price: "", currency_code: settings.default_currency_code });
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إنشاء الباقة.");
    } finally { setBusy(""); }
  };

  const savePlan = async (plan: Plan) => {
    const draft = planEdits[plan.id];
    if (!draft) return;
    setBusy(`plan:${plan.id}`);
    try {
      const { error } = await client.from("subscription_plans").update({
        name_ar: draft.name_ar.trim(),
        max_active_students: Number(draft.max_active_students),
        max_active_branches: Number(draft.max_active_branches),
        annual_price: Number(draft.annual_price),
        currency_code: draft.currency_code.toUpperCase(),
      }).eq("id", plan.id);
      if (error) throw error;
      toast.success("تم تحديث الباقة.");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحديث الباقة.");
    } finally { setBusy(""); }
  };

  const togglePlan = async (plan: Plan) => {
    setBusy(`plan:${plan.id}`);
    try {
      const { error } = await client.from("subscription_plans")
        .update({ is_active: !plan.is_active }).eq("id", plan.id);
      if (error) throw error;
      toast.success("تم تحديث حالة الباقة.");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحديث حالة الباقة.");
    } finally { setBusy(""); }
  };

  const approveRequest = async (request: RegistrationRequest) => {
    const selected = approval[request.id] ?? {
      planId: plans.find(plan => plan.is_active)?.id ?? "",
      trialDays: String(settings.trial_default_days),
      discount: "0",
    };
    if (!selected?.planId) { toast.error("اختر الباقة أولًا."); return; }
    setBusy(request.id);
    try {
      const { error } = await client.rpc("approve_school_registration", {
        target_request_id: request.id,
        target_plan_id: selected.planId,
        target_trial_days: Number(selected.trialDays),
        target_discount_amount: Number(selected.discount),
        target_review_note: null,
      });
      if (error) throw error;
      toast.success("تمت الموافقة وإنشاء المدرسة وتفعيل حساب مديرها.");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذرت الموافقة على الطلب.");
    } finally { setBusy(""); }
  };

  const rejectRequest = async (request: RegistrationRequest) => {
    if (!user?.id) return;
    setBusy(request.id);
    try {
      const { error } = await client.from("school_registration_requests").update({
        status: "rejected", reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_note: "تم رفض الطلب من إدارة المنصة.",
      }).eq("id", request.id).eq("status", "pending");
      if (error) throw error;
      toast.success("تم رفض الطلب.");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر رفض الطلب.");
    } finally { setBusy(""); }
  };

  const renewSubscription = async (subscription: Subscription) => {
    const defaultPlanId = plans.find(plan => plan.id === subscription.plan_id && plan.is_active)?.id ?? plans.find(plan => plan.is_active)?.id ?? "";
    const form = renewal[subscription.id] ?? {
      planId: defaultPlanId,
      amount: String(plans.find(plan => plan.id === defaultPlanId)?.annual_price ?? 0),
      method: "ccp",
      reference: "",
    };
    if (!form || Number(form.amount) <= 0) { toast.error("أدخل مبلغ الدفع الصحيح."); return; }
    setBusy(subscription.id);
    try {
      const { error } = await client.rpc("record_subscription_payment_and_renew", {
        target_school_id: subscription.school_id,
        target_amount: Number(form.amount),
        target_payment_method: form.method,
        target_paid_at: new Date().toISOString(),
        target_reference: form.reference.trim() || null,
        target_receipt_path: null,
        target_note: null,
        target_plan_id: form.planId,
        target_discount_amount: 0,
      });
      if (error) throw error;
      toast.success("تم تسجيل الدفع وتجديد الاشتراك لمدة سنة.");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تجديد الاشتراك.");
    } finally { setBusy(""); }
  };

  const rejectRenewalRequest = async (request: RenewalRequest) => {
    if (!user?.id) return;
    setBusy(`renewal:${request.id}`);
    try {
      const { error } = await client.from("school_subscription_renewal_requests").update({
        status: "rejected",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_note: "يرجى التواصل مع إدارة المنصة لاستكمال التجديد.",
      }).eq("id", request.id).eq("status", "pending");
      if (error) throw error;
      toast.success("تم تحديث طلب التجديد.");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحديث طلب التجديد.");
    } finally { setBusy(""); }
  };

  const extendSubscription = async (subscription: Subscription) => {
    const date = subscriptionExtensions[subscription.id];
    if (!date || !["active", "grace", "expired"].includes(subscription.status)) return;
    const endDate = new Date(`${date}T23:59:59`);
    if (Number.isNaN(endDate.getTime()) || endDate.getTime() <= Date.now()) {
      toast.error("اختر تاريخ نهاية مستقبليًا.");
      return;
    }
    const graceEnd = new Date(endDate.getTime() + Number(settings.grace_period_days) * 86400000);
    setBusy(`extend:${subscription.id}`);
    try {
      const { error } = await client.from("school_subscriptions").update({
        ends_at: endDate.toISOString(),
        grace_ends_at: graceEnd.toISOString(),
        status: "active",
      }).eq("id", subscription.id);
      if (error) throw error;
      toast.success("تم تمديد الاشتراك يدويًا.");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تمديد الاشتراك.");
    } finally { setBusy(""); }
  };

  const extendTrial = async (subscription: Subscription) => {
    const date = trialExtensions[subscription.id];
    if (!date || subscription.status !== "trial") return;
    const trialEnd = new Date(`${date}T23:59:59`).toISOString();
    if (new Date(trialEnd).getTime() <= Date.now()) {
      toast.error("اختر تاريخًا مستقبليًا لتمديد التجربة.");
      return;
    }
    setBusy(`trial:${subscription.id}`);
    try {
      const { error } = await client.from("school_subscriptions")
        .update({ trial_ends_at: trialEnd })
        .eq("id", subscription.id)
        .eq("status", "trial");
      if (error) throw error;
      toast.success("تم تمديد الفترة التجريبية.");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تمديد الفترة التجريبية.");
    } finally { setBusy(""); }
  };

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("settings");
    try {
      const { error } = await client.from("platform_settings").update({
        trial_default_days: Number(settings.trial_default_days),
        grace_period_days: Number(settings.grace_period_days),
        default_currency_code: settings.default_currency_code.toUpperCase(),
      }).eq("singleton", true);
      if (error) throw error;
      toast.success("تم حفظ إعدادات الاشتراك.");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ الإعدادات.");
    } finally { setBusy(""); }
  };

  const statusLabels: Record<string, string> = {
    legacy: "اشتراك سابق",
    trial: "تجريبي",
    active: "نشط",
    grace: "فترة سماح",
    expired: "منتهٍ",
    suspended: "موقوف",
    cancelled: "ملغى",
  };
  const statusLabel = (subscription: Subscription) => {
    const now = Date.now();
    if (subscription.status === "trial" && subscription.trial_ends_at
      && new Date(subscription.trial_ends_at).getTime() < now) return statusLabels.expired;
    if (["active", "grace", "expired"].includes(subscription.status)
      && subscription.ends_at && new Date(subscription.ends_at).getTime() < now) {
      if (subscription.grace_ends_at && new Date(subscription.grace_ends_at).getTime() >= now) {
        return statusLabels.grace;
      }
      return statusLabels.expired;
    }
    return statusLabels[subscription.status] ?? subscription.status;
  };

  return <main className="min-h-screen bg-[#F5F7F4] p-4 md:p-8" dir="rtl">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-wider text-[#56816A]">QURANOS · PLATFORM CONTROL</p>
          <h1 className="mt-1 text-2xl font-extrabold text-[#173B2D]">إدارة المنصة والاشتراكات</h1>
          <p className="mt-1 text-sm text-slate-500">إدارة المدارس والباقات والتجديدات من حساب مالك المنصة المستقل.</p>
        </div>
        <div className="flex gap-2">
          <button className={buttonClass} onClick={() => void reload()} disabled={loading}><RefreshCw size={16}/> تحديث البيانات</button>
          <button className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700" onClick={() => void signOut()}>تسجيل الخروج</button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[["الباقات", plans.length], ["طلبات الانضمام", requests.length], ["المدارس", subscriptions.length], ["الاشتراكات التجريبية", subscriptions.filter(item => item.status === "trial").length]].map(([label, value]) =>
          <div key={String(label)} className={cardClass}><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-extrabold text-[#173B2D]">{value}</p></div>
        )}
      </section>

      <section className={cardClass}>
        <div className="mb-4 flex items-center gap-2"><Plus className="text-[#17663B]" size={19}/><h2 className="font-extrabold text-[#173B2D]">إنشاء باقة سنوية</h2></div>
        <form onSubmit={createPlan} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <input className={inputClass} placeholder="رمز الباقة (basic)" value={planForm.code} onChange={e => setPlanForm(v => ({...v, code:e.target.value}))} required />
          <input className={inputClass} placeholder="اسم الباقة" value={planForm.name_ar} onChange={e => setPlanForm(v => ({...v, name_ar:e.target.value}))} required />
          <input className={inputClass} type="number" min="1" placeholder="حد التلاميذ" value={planForm.max_active_students} onChange={e => setPlanForm(v => ({...v, max_active_students:e.target.value}))} required />
          <input className={inputClass} type="number" min="1" placeholder="حد الفروع" value={planForm.max_active_branches} onChange={e => setPlanForm(v => ({...v, max_active_branches:e.target.value}))} required />
          <input className={inputClass} type="number" min="0" step="0.01" placeholder="السعر السنوي" value={planForm.annual_price} onChange={e => setPlanForm(v => ({...v, annual_price:e.target.value}))} required />
          <button className={buttonClass} disabled={busy === "plan"}><Plus size={16}/> إضافة الباقة</button>
          <input className={inputClass} maxLength={3} placeholder="العملة" value={planForm.currency_code} onChange={e => setPlanForm(v => ({...v, currency_code:e.target.value}))} required />
        </form>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {plans.map(plan => {
            const draft = planEdits[plan.id] ?? {
              name_ar: plan.name_ar,
              max_active_students: String(plan.max_active_students),
              max_active_branches: String(plan.max_active_branches),
              annual_price: String(plan.annual_price),
              currency_code: plan.currency_code,
            };
            return <div key={plan.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <strong className="text-sm text-[#173B2D]">{plan.name_ar}</strong>
                <span className="text-xs text-slate-500">{plan.is_active ? "متاحة" : "موقوفة"}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input className={inputClass} aria-label="اسم الباقة" value={draft.name_ar} onChange={e => setPlanEdits(v => ({...v,[plan.id]:{...draft,name_ar:e.target.value}}))}/>
                <input className={inputClass} aria-label="حد التلاميذ" type="number" min="1" value={draft.max_active_students} onChange={e => setPlanEdits(v => ({...v,[plan.id]:{...draft,max_active_students:e.target.value}}))}/>
                <input className={inputClass} aria-label="حد الفروع" type="number" min="1" value={draft.max_active_branches} onChange={e => setPlanEdits(v => ({...v,[plan.id]:{...draft,max_active_branches:e.target.value}}))}/>
                <div className="flex gap-1">
                  <input className={inputClass} aria-label="السعر السنوي" type="number" min="0" step="0.01" value={draft.annual_price} onChange={e => setPlanEdits(v => ({...v,[plan.id]:{...draft,annual_price:e.target.value}}))}/>
                  <input className="w-20 rounded-xl border border-slate-200 px-2 text-sm uppercase" aria-label="العملة" maxLength={3} value={draft.currency_code} onChange={e => setPlanEdits(v => ({...v,[plan.id]:{...draft,currency_code:e.target.value}}))}/>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <button className={buttonClass} disabled={busy === `plan:${plan.id}`} onClick={() => void savePlan(plan)}>حفظ تعديلات الباقة</button>
                <button className="rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700" disabled={busy === `plan:${plan.id}`} onClick={() => void togglePlan(plan)}>{plan.is_active ? "إيقاف الباقة" : "تفعيل الباقة"}</button>
              </div>
            </div>;
          })}
        </div>
      </section>

      <section className={cardClass}>
        <div className="mb-4 flex items-center gap-2"><CheckCircle2 className="text-[#17663B]" size={19}/><h2 className="font-extrabold text-[#173B2D]">طلبات تسجيل المدارس</h2></div>
        {requests.length === 0 ? <p className="text-sm text-slate-500">لا توجد طلبات معلقة حاليًا.</p> : <div className="space-y-3">
          {requests.map(request => {
            const selected = approval[request.id] ?? { planId: plans.find(plan => plan.is_active)?.id ?? "", trialDays: String(settings.trial_default_days), discount: "0" };
            return <article key={request.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap justify-between gap-3">
                <div><h3 className="font-bold text-[#173B2D]">{request.school_name}</h3><p className="text-xs text-slate-500" dir="ltr">{request.slug}</p></div>
                <span className="text-xs text-slate-500">{new Date(request.created_at).toLocaleDateString("ar-DZ-u-nu-latn")}</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{request.contact_phone ?? "دون هاتف"} · {request.contact_email ?? "دون بريد"}</p>
              {request.address && <p className="text-sm text-slate-600">{request.address}</p>}
              {request.applicant_note && <p className="mt-1 text-sm text-slate-600">{request.applicant_note}</p>}
              <div className="mt-3 grid gap-2 sm:grid-cols-4">
                <select className={inputClass} value={selected.planId} onChange={e => setApproval(v => ({...v,[request.id]:{...selected,planId:e.target.value}}))}>
                  <option value="">اختر الباقة</option>{plans.filter(plan => plan.is_active).map(plan => <option key={plan.id} value={plan.id}>{plan.name_ar} — {plan.annual_price} {plan.currency_code}/سنة</option>)}
                </select>
                <input className={inputClass} type="number" min="0" max="365" value={selected.trialDays} aria-label="أيام التجربة" onChange={e => setApproval(v => ({...v,[request.id]:{...selected,trialDays:e.target.value}}))}/>
                <input className={inputClass} type="number" min="0" step="0.01" value={selected.discount} aria-label="الخصم" onChange={e => setApproval(v => ({...v,[request.id]:{...selected,discount:e.target.value}}))}/>
                <div className="flex gap-2">
                  <button className={buttonClass} disabled={busy === request.id || !selected.planId} onClick={() => void approveRequest(request)}>موافقة وتفعيل</button>
                  <button className="rounded-xl border border-red-200 px-3 text-red-700" disabled={busy === request.id} onClick={() => void rejectRequest(request)} aria-label="رفض الطلب"><XCircle size={18}/></button>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">أيام التجربة: {selected.trialDays} · الخصم: {selected.discount} · التجربة تشمل جميع وظائف المنصة.</p>
            </article>;
          })}
        </div>}
      </section>

      <section className={cardClass}>
        <div className="mb-4 flex items-center gap-2"><RefreshCw className="text-[#17663B]" size={19}/><h2 className="font-extrabold text-[#173B2D]">طلبات تجديد الاشتراك</h2></div>
        {renewalRequests.length === 0 ? <p className="text-sm text-slate-500">لا توجد طلبات تجديد معلقة.</p> : <div className="space-y-2">
          {renewalRequests.map(request => <article key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
            <div><strong className="text-sm">{schools[request.school_id] ?? request.school_id.slice(0,8)}</strong><p className="text-xs text-slate-500">{request.message || "طلب تجديد دون ملاحظات"} · {new Date(request.created_at).toLocaleDateString("ar-DZ-u-nu-latn")}</p></div>
            <button className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700" disabled={busy === `renewal:${request.id}`} onClick={() => void rejectRenewalRequest(request)}>رفض الطلب</button>
          </article>)}
        </div>}
      </section>

      <section className={cardClass}>
        <div className="mb-4 flex items-center gap-2"><CreditCard className="text-[#17663B]" size={19}/><h2 className="font-extrabold text-[#173B2D]">اشتراكات المدارس والتجديد اليدوي</h2></div>
        {subscriptions.length === 0 ? <p className="text-sm text-slate-500">لا توجد اشتراكات مسجلة.</p> : <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-sm">
            <thead><tr className="border-b text-right text-slate-500"><th className="p-2">المدرسة</th><th className="p-2">الباقة</th><th className="p-2">الحالة</th><th className="p-2">النهاية</th><th className="p-2">حدود الباقة</th><th className="p-2">تسجيل التجديد</th></tr></thead>
            <tbody>{subscriptions.map(subscription => {
              const defaultPlanId = plans.find(plan => plan.id === subscription.plan_id && plan.is_active)?.id ?? plans.find(plan => plan.is_active)?.id ?? "";
              const form = renewal[subscription.id] ?? { planId: defaultPlanId, amount: String(plans.find(plan => plan.id === defaultPlanId)?.annual_price ?? subscription.agreed_annual_price ?? 0), method: "ccp", reference: "" };
              return <tr key={subscription.id} className="border-b last:border-0">
                <td className="p-2 font-semibold">{schools[subscription.school_id] ?? subscription.school_id.slice(0,8)}</td>
                <td className="p-2">{subscription.plan_name_snapshot}</td>
                <td className="p-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{statusLabel(subscription)}</span></td>
                <td className="p-2">
                  {subscription.trial_ends_at
                    ? <div className="flex min-w-[220px] items-center gap-1">
                        <span>{new Date(subscription.trial_ends_at).toLocaleDateString("ar-DZ-u-nu-latn")}</span>
                        {subscription.status === "trial" && <>
                          <input className="w-32 rounded-lg border px-2 py-1" type="date" min={new Date().toISOString().slice(0,10)} value={trialExtensions[subscription.id] ?? new Date(subscription.trial_ends_at).toISOString().slice(0,10)} onChange={e => setTrialExtensions(v => ({...v,[subscription.id]:e.target.value}))} aria-label="تاريخ نهاية التجربة"/>
                          <button className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-bold" disabled={busy === `trial:${subscription.id}`} onClick={() => void extendTrial(subscription)}>تمديد التجربة</button>
                        </>}
                      </div>
                    : subscription.ends_at ? <div className="flex min-w-[260px] items-center gap-1">
                        <span>{new Date(subscription.ends_at).toLocaleDateString("ar-DZ-u-nu-latn")}</span>
                        {["active", "grace", "expired"].includes(subscription.status) && <>
                          <input className="w-32 rounded-lg border px-2 py-1" type="date" min={new Date().toISOString().slice(0,10)} value={subscriptionExtensions[subscription.id] ?? new Date(subscription.ends_at).toISOString().slice(0,10)} onChange={e => setSubscriptionExtensions(v => ({...v,[subscription.id]:e.target.value}))} aria-label="تاريخ نهاية الاشتراك"/>
                          <button className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-bold" disabled={busy === `extend:${subscription.id}`} onClick={() => void extendSubscription(subscription)}>تمديد الاشتراك</button>
                        </>}
                      </div> : "غير محدد"}
                </td>
                <td className="p-2">{subscription.max_active_students ?? "∞"} تلميذ · {subscription.max_active_branches ?? "∞"} فرع</td>
                <td className="p-2"><div className="flex min-w-[420px] gap-1">
                  <select className="w-32 rounded-lg border px-2 py-1" value={form.planId} onChange={e => { const nextPlan = plans.find(plan => plan.id === e.target.value); setRenewal(v => ({...v,[subscription.id]:{...form,planId:e.target.value,amount:String(nextPlan?.annual_price ?? form.amount)}})); }} aria-label="الباقة الجديدة">
                    {plans.filter(plan => plan.is_active).map(plan => <option key={plan.id} value={plan.id}>{plan.name_ar}</option>)}
                  </select>
                  <input className="w-24 rounded-lg border px-2 py-1" type="number" min="1" step="0.01" value={form.amount} aria-label="مبلغ الدفع" onChange={e => setRenewal(v => ({...v,[subscription.id]:{...form,amount:e.target.value}}))}/>
                  <select className="w-28 rounded-lg border px-2 py-1" value={form.method} onChange={e => setRenewal(v => ({...v,[subscription.id]:{...form,method:e.target.value}}))}>
                    <option value="ccp">بريد الجزائر</option><option value="cash">نقدًا</option><option value="bank_transfer">تحويل بنكي</option><option value="cheque">صك</option><option value="other">أخرى</option>
                  </select>
                  <input className="w-24 rounded-lg border px-2 py-1" placeholder="مرجع" value={form.reference} onChange={e => setRenewal(v => ({...v,[subscription.id]:{...form,reference:e.target.value}}))}/>
                  <button className={buttonClass} disabled={busy === subscription.id} onClick={() => void renewSubscription(subscription)}>تجديد سنة</button>
                </div></td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <form className={cardClass} onSubmit={saveSettings}>
          <div className="mb-4 flex items-center gap-2"><Settings2 className="text-[#17663B]" size={19}/><h2 className="font-extrabold text-[#173B2D]">إعدادات التجربة والسماح</h2></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-semibold text-slate-600">مدة التجربة الافتراضية (يوم)<input className={inputClass + " mt-1"} type="number" min="0" max="365" value={settings.trial_default_days} onChange={e => setSettings(v => ({...v,trial_default_days:Number(e.target.value)}))}/></label>
            <label className="text-xs font-semibold text-slate-600">فترة السماح (يوم)<input className={inputClass + " mt-1"} type="number" min="0" max="90" value={settings.grace_period_days} onChange={e => setSettings(v => ({...v,grace_period_days:Number(e.target.value)}))}/></label>
            <label className="text-xs font-semibold text-slate-600">العملة الافتراضية<input className={inputClass + " mt-1"} maxLength={3} value={settings.default_currency_code} onChange={e => setSettings(v => ({...v,default_currency_code:e.target.value.toUpperCase()}))}/></label>
          </div>
          <button className={buttonClass + " mt-4"} disabled={busy === "settings"}>حفظ الإعدادات</button>
        </form>
        <section className={cardClass}>
          <div className="mb-4 flex items-center gap-2"><ScrollText className="text-[#17663B]" size={19}/><h2 className="font-extrabold text-[#173B2D]">سجل عمليات الإدارة</h2></div>
          <div className="max-h-64 space-y-2 overflow-auto">
            {audit.map(row => <div key={row.id} className="flex justify-between gap-3 border-b pb-2 text-xs last:border-0">
              <span>{row.action === "insert" ? "إضافة" : row.action === "update" ? "تعديل" : "حذف"} · {row.entity_type}</span>
              <time className="shrink-0 text-slate-500">{new Date(row.created_at).toLocaleString("ar-DZ-u-nu-latn")}</time>
            </div>)}
            {audit.length === 0 && <p className="text-sm text-slate-500">لا توجد عمليات مسجلة بعد.</p>}
          </div>
        </section>
      </section>
      {loading && <p className="text-center text-xs text-slate-500">جارٍ تحديث البيانات...</p>}
    </div>
  </main>;
}
