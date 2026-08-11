import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Building2, Landmark, Plus, RefreshCw, RotateCcw, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import FinanceNavigation from "@/components/FinanceNavigation";
import { useAuth } from "@/contexts/AuthContext";
import { formatDzd } from "@/lib/finance";
import {
  createOtherIncome,
  createTreasuryAccount,
  fetchTreasuryWorkspace,
  otherIncomeCategoryLabel,
  recordTreasuryAdjustment,
  recordTreasuryTransfer,
  reverseOtherIncome,
  reverseTreasuryAdjustment,
  reverseTreasuryTransfer,
  treasuryAccountTypeLabel,
  treasuryErrorMessage,
  treasuryMovementLabel,
  updateTreasuryAccount,
  type OtherIncomeCategory,
  type TreasuryAccountType,
  type TreasuryPaymentMethod,
  type TreasuryWorkspace,
} from "@/lib/treasury";

type LoadState = "loading" | "ready" | "error" | "forbidden";
const today = () => new Date().toISOString().slice(0, 10);
const selectClass = "mt-1 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm";
const paymentMethods: Array<[TreasuryPaymentMethod, string]> = [["cash", "نقدًا"], ["bank_transfer", "تحويل بنكي"], ["postal", "بريدي"], ["cheque", "صك"], ["other", "أخرى"]];
const incomeCategories: OtherIncomeCategory[] = ["donation", "grant_subsidy", "activity", "rent_asset", "other"];

export default function Treasury() {
  const { school } = useAuth();
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<TreasuryWorkspace | null>(null);
  const [busy, setBusy] = useState(false);
  const [accountDialog, setAccountDialog] = useState(false);
  const [incomeDialog, setIncomeDialog] = useState(false);
  const [transferDialog, setTransferDialog] = useState(false);
  const [adjustDialog, setAdjustDialog] = useState(false);

  const load = useCallback(async () => {
    if (!school?.id) return;
    setState("loading");
    try {
      setData(await fetchTreasuryWorkspace(school.id));
      setState("ready");
    } catch (error) {
      setData(null);
      const message = treasuryErrorMessage(error);
      setState(message.includes("عرض الخزينة") ? "forbidden" : "error");
    }
  }, [school?.id]);
  useEffect(() => { void load(); }, [load]);

  const accountNames = useMemo(() => new Map((data?.accounts ?? []).map(a => [a.id, a.name])), [data?.accounts]);
  const branchNames = useMemo(() => new Map((data?.branches ?? []).map(b => [b.id, b.name])), [data?.branches]);
  const manageableAccounts = useMemo(() => (data?.accounts ?? []).filter(a => a.canManage && a.status === "active"), [data?.accounts]);
  const canManageAny = Boolean(data?.canManageSchool || data?.branches.some(b => b.canManage));

  const run = async (action: () => Promise<unknown>, success: string, close?: () => void) => {
    setBusy(true);
    try { await action(); toast.success(success); close?.(); await load(); }
    catch (error) { toast.error(treasuryErrorMessage(error)); }
    finally { setBusy(false); }
  };

  if (state === "loading") return <main className="flex min-h-[70vh] items-center justify-center" dir="rtl"><RefreshCw className="animate-spin text-[#17663B]" /></main>;
  if (state === "forbidden") return <main className="p-8 text-center" dir="rtl"><Card className="mx-auto max-w-xl p-10"><h1 className="text-lg font-bold">لا تملك صلاحية عرض الخزينة</h1><p className="mt-2 text-sm text-gray-500">يلزم finance.view أو finance.manage على المدرسة أو أحد الفروع.</p></Card></main>;
  if (state === "error" || !data || !school?.id) return <main className="p-8 text-center" dir="rtl"><Card className="mx-auto max-w-xl p-10"><p>تعذر تحميل الخزينة.</p><Button className="mt-4" variant="outline" onClick={() => void load()}>إعادة المحاولة</Button></Card></main>;

  return (
    <div className="min-h-screen bg-[#F8F9FA]" dir="rtl">
      <header className="border-b bg-white px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-xl font-bold text-[#173B2D]">الخزينة والحسابات</h1><p className="mt-1 text-xs text-gray-500">الرصيد مشتق من الحركات المنشورة؛ التحويل الداخلي لا يُحتسب إيرادًا أو مصروفًا.</p></div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void load()}><RefreshCw size={15} /> تحديث</Button>
            {canManageAny && <Button onClick={() => setAccountDialog(true)}><Plus size={16} /> حساب جديد</Button>}
          </div>
        </div>
      </header>
      <FinanceNavigation currentPath="/finance/treasury" className="mx-auto max-w-[1600px]" />
      <main className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6">
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-[#173B2D]">الأرصدة الحالية</h2><p className="text-xs text-gray-500">صناديق نقدية وحسابات بنكية وبريدية ضمن نطاقك.</p></div>{canManageAny && data.accounts.length > 0 && <div className="flex gap-2"><Button variant="outline" onClick={() => setIncomeDialog(true)}>إيراد آخر</Button><Button variant="outline" onClick={() => setTransferDialog(true)}>تحويل</Button><Button variant="outline" onClick={() => setAdjustDialog(true)}>إيداع/سحب</Button></div>}</div>
          {data.accounts.length === 0 ? <Card className="border-dashed p-10 text-center text-sm text-gray-500">لا توجد حسابات بعد. أنشئ أول صندوق/حساب برصيد افتتاحي صريح.</Card> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.accounts.map(account => (
            <Card key={account.id} className="p-5"><div className="flex items-start justify-between gap-3"><div className="flex gap-3">{account.accountType === "cash" ? <WalletCards className="text-[#17663B]" /> : account.accountType === "bank" ? <Landmark className="text-[#17663B]" /> : <Building2 className="text-[#17663B]" />}<div><h3 className="font-bold">{account.name}</h3><p className="text-xs text-gray-500">{treasuryAccountTypeLabel(account.accountType)} · {account.code}</p><p className="text-xs text-gray-500">{account.branchId ? branchNames.get(account.branchId) ?? "فرع" : "مستوى المدرسة"}</p></div></div><span className="rounded-full bg-gray-100 px-2 py-1 text-xs">{account.status === "active" ? "نشط" : account.status === "inactive" ? "متوقف" : "مؤرشف"}</span></div><p className={`mt-5 text-2xl font-extrabold ${account.balance >= 0 ? "text-[#17663B]" : "text-red-700"}`}>{formatDzd(account.balance)}</p>{account.accountReference && <p className="mt-1 font-mono text-xs text-gray-500">{account.accountReference}</p>}{account.canManage && account.status !== "archived" && <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => updateTreasuryAccount(school.id, account.id, account.name, account.accountReference ?? "", account.status === "active" ? "inactive" : "active"), account.status === "active" ? "تم إيقاف الحساب مع حفظ تاريخه." : "تم تفعيل الحساب.")}>{account.status === "active" ? "إيقاف" : "تفعيل"}</Button>{account.balance === 0 && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => updateTreasuryAccount(school.id, account.id, account.name, account.accountReference ?? "", "archived"), "تمت أرشفة الحساب.")}>أرشفة</Button>}</div>}</Card>
          ))}</div>}
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Card className="overflow-hidden"><div className="border-b p-4"><h2 className="font-bold">الإيرادات غير الطلابية</h2><p className="text-xs text-gray-500">تبرعات ومنح وأنشطة وتأجير أصول وإيرادات أخرى.</p></div><div className="max-h-[420px] overflow-auto divide-y">{data.otherIncome.length === 0 ? <p className="p-8 text-center text-sm text-gray-400">لا توجد إيرادات أخرى.</p> : data.otherIncome.map(row => <div key={row.id} className="p-4 text-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{row.sourceDescription}</p><p className="mt-1 text-xs text-gray-500">{otherIncomeCategoryLabel(row.category)} · {row.incomeDate} · {accountNames.get(row.treasuryAccountId) ?? "حساب"}</p></div><div className="text-left"><p className="font-bold text-emerald-700">{formatDzd(row.amount)}</p><span className="text-xs text-gray-500">{row.status === "recorded" ? "مسجل" : "معكوس"}</span></div></div>{row.status === "recorded" && manageableAccounts.some(a => a.id === row.treasuryAccountId) && <Button size="sm" variant="ghost" className="mt-2" disabled={busy} onClick={() => { const reason = window.prompt("سبب عكس الإيراد (يحفظ في السجل):"); if (reason) void run(() => reverseOtherIncome(school.id, row.id, reason), "تم عكس الإيراد وحركة الخزينة."); }}><RotateCcw size={14} /> عكس</Button>}</div>)}</div></Card>

          <Card className="overflow-hidden"><div className="border-b p-4"><h2 className="font-bold">آخر حركات الخزينة</h2><p className="text-xs text-gray-500">السجل يثبت مكان دخول وخروج المال ولا يكرر الإيراد/المصروف في التقارير.</p></div><div className="max-h-[420px] overflow-auto divide-y">{data.movements.length === 0 ? <p className="p-8 text-center text-sm text-gray-400">لا توجد حركات بعد.</p> : data.movements.map(row => <div key={row.id} className="flex items-start justify-between gap-3 p-4 text-sm"><div className="flex gap-2">{row.direction === "in" ? <ArrowDownLeft className="text-emerald-600" size={18} /> : <ArrowUpRight className="text-rose-600" size={18} />}<div><p className="font-bold">{treasuryMovementLabel(row.movementType)}</p><p className="text-xs text-gray-500">{accountNames.get(row.accountId) ?? "حساب"} · {row.movementDate}{row.referenceNumber ? ` · ${row.referenceNumber}` : ""}</p>{row.notes && <p className="mt-1 text-xs text-gray-500">{row.notes}</p>}</div></div><div className="text-left"><p className={row.direction === "in" ? "font-bold text-emerald-700" : "font-bold text-rose-700"}>{row.direction === "in" ? "+" : "−"}{formatDzd(row.amount)}</p><span className="text-xs text-gray-500">{row.status === "posted" ? "منشور" : "معكوس"}</span>{row.status === "posted" && ["manual_deposit", "manual_withdrawal"].includes(row.movementType) && manageableAccounts.some(a => a.id === row.accountId) && <button className="mt-1 block text-xs text-red-600" onClick={() => { const reason = window.prompt("سبب عكس الحركة:"); if (reason) void run(() => reverseTreasuryAdjustment(school.id, row.id, reason), "تم عكس الحركة."); }}>عكس</button>}</div></div>)}</div></Card>
        </section>

        <Card className="overflow-hidden"><div className="border-b p-4"><h2 className="font-bold">التحويلات الداخلية</h2><p className="text-xs text-gray-500">كل تحويل = خروج من حساب + دخول إلى حساب بالقيمة نفسها.</p></div><div className="divide-y">{data.transfers.length === 0 ? <p className="p-8 text-center text-sm text-gray-400">لا توجد تحويلات.</p> : data.transfers.map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"><div className="flex items-center gap-2"><ArrowRightLeft size={18} className="text-[#17663B]" /><div><p className="font-bold">{accountNames.get(row.fromAccountId) ?? "حساب"} ← {accountNames.get(row.toAccountId) ?? "حساب"}</p><p className="text-xs text-gray-500">{row.transferDate}{row.referenceNumber ? ` · ${row.referenceNumber}` : ""}</p></div></div><div className="flex items-center gap-3"><span className="font-bold">{formatDzd(row.amount)}</span><span className="text-xs text-gray-500">{row.status === "posted" ? "منشور" : "معكوس"}</span>{row.status === "posted" && manageableAccounts.some(a => a.id === row.fromAccountId) && manageableAccounts.some(a => a.id === row.toAccountId) && <Button size="sm" variant="ghost" disabled={busy} onClick={() => { const reason = window.prompt("سبب عكس التحويل:"); if (reason) void run(() => reverseTreasuryTransfer(school.id, row.id, reason), "تم عكس طرفي التحويل."); }}>عكس</Button>}</div></div>)}</div></Card>
      </main>

      <AccountDialog open={accountDialog} onOpenChange={setAccountDialog} schoolId={school.id} data={data} busy={busy} onSubmit={(input, close) => void run(() => createTreasuryAccount(input), "تم إنشاء الحساب وتسجيل رصيده الافتتاحي.", close)} />
      <IncomeDialog open={incomeDialog} onOpenChange={setIncomeDialog} schoolId={school.id} data={data} busy={busy} onSubmit={(input, close) => void run(() => createOtherIncome(input), "تم تسجيل الإيراد وحركة الخزينة.", close)} />
      <TransferDialog open={transferDialog} onOpenChange={setTransferDialog} schoolId={school.id} accounts={manageableAccounts} busy={busy} onSubmit={(input, close) => void run(() => recordTreasuryTransfer(input), "تم التحويل بين الحسابين بصورة متوازنة.", close)} />
      <AdjustmentDialog open={adjustDialog} onOpenChange={setAdjustDialog} schoolId={school.id} accounts={manageableAccounts} busy={busy} onSubmit={(input, close) => void run(() => recordTreasuryAdjustment(input), "تم تسجيل حركة الخزينة.", close)} />
    </div>
  );
}

function AccountDialog({ open, onOpenChange, schoolId, data, busy, onSubmit }: any) {
  const [scope, setScope] = useState(data.canManageSchool ? "school" : (data.branches.find((b: any) => b.canManage)?.id ?? "")); const [type, setType] = useState<TreasuryAccountType>("cash"); const [name, setName] = useState(""); const [code, setCode] = useState(""); const [reference, setReference] = useState(""); const [opening, setOpening] = useState("0"); const [date, setDate] = useState(today());
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent dir="rtl"><DialogHeader><DialogTitle>حساب خزينة جديد</DialogTitle><DialogDescription>الرصيد الافتتاحي يسجل كحركة مستقلة ولا يصبح عمودًا قابلًا للتعديل.</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">النطاق<select value={scope} onChange={e => setScope(e.target.value)} className={selectClass}>{data.canManageSchool && <option value="school">مستوى المدرسة</option>}{data.branches.filter((b: any) => b.canManage).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label className="text-xs font-bold">النوع<select value={type} onChange={e => setType(e.target.value as TreasuryAccountType)} className={selectClass}><option value="cash">صندوق نقدي</option><option value="bank">حساب بنكي</option><option value="postal">حساب بريدي</option></select></label><label className="text-xs font-bold">الاسم<Input className="mt-1" value={name} onChange={e => setName(e.target.value)} /></label><label className="text-xs font-bold">الرمز<Input className="mt-1" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="CASH_MAIN" /></label><label className="text-xs font-bold">رقم/مرجع الحساب<Input className="mt-1" value={reference} onChange={e => setReference(e.target.value)} placeholder="اختياري" /></label><label className="text-xs font-bold">الرصيد الافتتاحي<Input className="mt-1" inputMode="decimal" value={opening} onChange={e => setOpening(e.target.value)} /></label><label className="text-xs font-bold">تاريخ الرصيد<Input className="mt-1" type="date" value={date} onChange={e => setDate(e.target.value)} /></label></div><Button disabled={busy || !scope || name.trim().length < 2 || code.trim().length < 2 || !Number.isFinite(Number(opening))} onClick={() => onSubmit({ schoolId, branchId: scope === "school" ? null : scope, accountType: type, name, code, accountReference: reference, openingBalance: Number(opening), openingDate: date }, () => onOpenChange(false))}>إنشاء الحساب</Button></DialogContent></Dialog>;
}

function IncomeDialog({ open, onOpenChange, schoolId, data, busy, onSubmit }: any) {
  const [scope, setScope] = useState(data.canManageSchool ? "school" : (data.branches.find((b: any) => b.canManage)?.id ?? "")); const [accountId, setAccountId] = useState(""); const [category, setCategory] = useState<OtherIncomeCategory>("donation"); const [source, setSource] = useState(""); const [amount, setAmount] = useState(""); const [date, setDate] = useState(today()); const [method, setMethod] = useState<TreasuryPaymentMethod>("cash"); const [reference, setReference] = useState(""); const [notes, setNotes] = useState("");
  const compatible = data.accounts.filter((a: any) => a.canManage && a.status === "active" && (scope === "school" ? a.branchId === null : (a.branchId === scope || (a.branchId === null && data.canManageSchool))));
  useEffect(() => { if (!compatible.some((a: any) => a.id === accountId)) setAccountId(compatible[0]?.id ?? ""); }, [scope, data.accounts]);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent dir="rtl"><DialogHeader><DialogTitle>إيراد غير طلابي</DialogTitle><DialogDescription>الإيراد يسجل مرة واحدة، وحركة الخزينة تحدد فقط أين دخل المال.</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">النطاق<select value={scope} onChange={e => setScope(e.target.value)} className={selectClass}>{data.canManageSchool && <option value="school">مستوى المدرسة</option>}{data.branches.filter((b: any) => b.canManage).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label className="text-xs font-bold">حساب القبض<select value={accountId} onChange={e => setAccountId(e.target.value)} className={selectClass}>{compatible.map((a: any) => <option key={a.id} value={a.id}>{a.name} · {formatDzd(a.balance)}</option>)}</select></label><label className="text-xs font-bold">الفئة<select value={category} onChange={e => setCategory(e.target.value as OtherIncomeCategory)} className={selectClass}>{incomeCategories.map(v => <option key={v} value={v}>{otherIncomeCategoryLabel(v)}</option>)}</select></label><label className="text-xs font-bold">المصدر<Input className="mt-1" value={source} onChange={e => setSource(e.target.value)} /></label><label className="text-xs font-bold">المبلغ<Input className="mt-1" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label><label className="text-xs font-bold">التاريخ<Input className="mt-1" type="date" value={date} onChange={e => setDate(e.target.value)} /></label><label className="text-xs font-bold">طريقة القبض<select value={method} onChange={e => setMethod(e.target.value as TreasuryPaymentMethod)} className={selectClass}>{paymentMethods.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label><label className="text-xs font-bold">المرجع<Input className="mt-1" value={reference} onChange={e => setReference(e.target.value)} /></label></div><Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات اختيارية" /><Button disabled={busy || !accountId || source.trim().length < 2 || Number(amount) <= 0} onClick={() => onSubmit({ schoolId, branchId: scope === "school" ? null : scope, accountId, category, sourceDescription: source, amount: Number(amount), incomeDate: date, paymentMethod: method, referenceNumber: reference, notes }, () => onOpenChange(false))}>تسجيل الإيراد</Button></DialogContent></Dialog>;
}

function TransferDialog({ open, onOpenChange, schoolId, accounts, busy, onSubmit }: any) { const [from, setFrom] = useState(accounts[0]?.id ?? ""); const [to, setTo] = useState(accounts[1]?.id ?? ""); const [amount, setAmount] = useState(""); const [date, setDate] = useState(today()); const [ref, setRef] = useState(""); const [notes, setNotes] = useState(""); return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent dir="rtl"><DialogHeader><DialogTitle>تحويل داخلي</DialogTitle><DialogDescription>التحويل لا يدخل في الإيرادات أو المصروفات.</DialogDescription></DialogHeader><label className="text-xs font-bold">من<select className={selectClass} value={from} onChange={e => setFrom(e.target.value)}>{accounts.map((a:any)=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label className="text-xs font-bold">إلى<select className={selectClass} value={to} onChange={e => setTo(e.target.value)}>{accounts.map((a:any)=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><Input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="المبلغ"/><Input type="date" value={date} onChange={e=>setDate(e.target.value)}/><Input value={ref} onChange={e=>setRef(e.target.value)} placeholder="مرجع اختياري"/><Textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="ملاحظات"/><Button disabled={busy || !from || !to || from===to || Number(amount)<=0} onClick={()=>onSubmit({schoolId,fromAccountId:from,toAccountId:to,amount:Number(amount),date,referenceNumber:ref,notes},()=>onOpenChange(false))}>تنفيذ التحويل</Button></DialogContent></Dialog>; }
function AdjustmentDialog({ open, onOpenChange, schoolId, accounts, busy, onSubmit }: any) { const [accountId,setAccountId]=useState(accounts[0]?.id??""); const [kind,setKind]=useState<"manual_deposit"|"manual_withdrawal">("manual_deposit"); const [amount,setAmount]=useState(""); const [date,setDate]=useState(today()); const [ref,setRef]=useState(""); const [notes,setNotes]=useState(""); return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent dir="rtl"><DialogHeader><DialogTitle>إيداع / سحب يدوي</DialogTitle><DialogDescription>للتسويات النقدية فقط؛ لا يُسجل كإيراد أو مصروف تجاري.</DialogDescription></DialogHeader><select className={selectClass} value={accountId} onChange={e=>setAccountId(e.target.value)}>{accounts.map((a:any)=><option key={a.id} value={a.id}>{a.name}</option>)}</select><select className={selectClass} value={kind} onChange={e=>setKind(e.target.value as any)}><option value="manual_deposit">إيداع</option><option value="manual_withdrawal">سحب</option></select><Input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="المبلغ"/><Input type="date" value={date} onChange={e=>setDate(e.target.value)}/><Input value={ref} onChange={e=>setRef(e.target.value)} placeholder="مرجع اختياري"/><Textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="سبب الحركة (مطلوب)"/><Button disabled={busy || !accountId || Number(amount)<=0 || notes.trim().length<3} onClick={()=>onSubmit({schoolId,accountId,kind,amount:Number(amount),date,referenceNumber:ref,notes},()=>onOpenChange(false))}>تسجيل الحركة</Button></DialogContent></Dialog>; }
