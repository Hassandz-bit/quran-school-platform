import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { fetchFinanceModuleAccess, type FinanceModuleAccess } from "@/lib/finance-navigation";

type Props = { currentPath: string; className?: string };
const emptyAccess: FinanceModuleAccess = { canViewFinance: false, canManageFinance: false, canManageExpenses: false };

export default function FinanceNavigation({ currentPath, className = "" }: Props) {
  const [access, setAccess] = useState<FinanceModuleAccess>(emptyAccess);
  const [loading, setLoading] = useState(true);
  const [, setLocation] = useLocation();
  const { school } = useAuth();

  useEffect(() => {
    let active = true;
    if (!school?.id) { setLoading(false); return; }
    setLoading(true);
    void fetchFinanceModuleAccess(school.id)
      .then(result => { if (active) setAccess(result); })
      .catch(() => { if (active) setAccess(emptyAccess); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [school?.id]);

  const links = useMemo(() => {
    const any = access.canViewFinance || access.canManageExpenses;
    return [
      ["الملخص", "/finance", any],
      ["خطط الرسوم", "/finance/fee-plans", access.canManageFinance],
      ["الاستحقاقات", "/finance/charges", access.canViewFinance],
      ["الدفعات", "/finance/payments", access.canViewFinance],
      ["الرواتب", "/finance/payroll", access.canViewFinance],
      ["سجل الأجور", "/finance/payroll/history", access.canViewFinance],
      ["المصروفات", "/finance/expenses", access.canManageExpenses],
      ["الخزينة", "/finance/treasury", access.canViewFinance],
      ["التقارير", "/finance/reports", any],
    ].filter(([, , visible]) => visible) as Array<[string, string, boolean]>;
  }, [access]);

  if (loading) return <div role="status" aria-label="جارٍ تحميل التنقل المالي" className={`flex gap-2 overflow-hidden px-4 py-3 print:hidden md:px-6 ${className}`}>{[0,1,2,3].map(i => <span key={i} className="h-8 w-24 shrink-0 animate-pulse rounded-full bg-gray-100" />)}</div>;

  return <nav aria-label="التنقل المالي" className={`flex gap-2 overflow-x-auto border-b border-gray-100 bg-white px-4 py-3 print:hidden md:px-6 ${className}`}>
    {links.map(([label, path]) => <a key={path} href={path} onClick={event => { event.preventDefault(); setLocation(path); }} aria-current={currentPath === path ? "page" : undefined} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${currentPath === path ? "bg-[#0B4738] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{label}</a>)}
  </nav>;
}
