import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import RecurringBillingLauncher from "@/components/RecurringBillingLauncher";
import StudentDiscountPolicyLauncher from "@/components/StudentDiscountPolicyLauncher";
import {
  fetchFinanceModuleAccess,
  type FinanceModuleAccess,
} from "@/lib/finance-navigation";

type Props = {
  currentPath: string;
  className?: string;
};

const emptyAccess: FinanceModuleAccess = {
  canViewFinance: false,
  canManageFinance: false,
  canManageExpenses: false,
};

const FINANCE_SCROLL_KEY = "quranos:finance-navigation-scroll";

function persistFinanceScroll(value: number) {
  try {
    window.sessionStorage.setItem(FINANCE_SCROLL_KEY, String(value));
  } catch {
    // Navigation remains functional without storage.
  }
}

export default function FinanceNavigation({
  currentPath,
  className = "",
}: Props) {
  const [access, setAccess] = useState<FinanceModuleAccess>(emptyAccess);
  const [loading, setLoading] = useState(true);
  const [, setLocation] = useLocation();
  const { school } = useAuth();
  const navigationRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    if (!school?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    void fetchFinanceModuleAccess(school.id)
      .then(result => {
        if (active) setAccess(result);
      })
      .catch(() => {
        if (active) setAccess(emptyAccess);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [school?.id]);

  const links = useMemo(() => {
    const hasAnyAccess = access.canViewFinance || access.canManageExpenses;

    return [
      { label: "الملخص", path: "/finance", visible: hasAnyAccess },
      {
        label: "خطط الرسوم",
        path: "/finance/fee-plans",
        visible: access.canManageFinance,
      },
      {
        label: "الاستحقاقات",
        path: "/finance/charges",
        visible: access.canViewFinance,
      },
      {
        label: "الدفعات",
        path: "/finance/payments",
        visible: access.canViewFinance,
      },
      {
        label: "الرواتب",
        path: "/finance/payroll",
        visible: access.canViewFinance,
      },
      {
        label: "سجل الأجور",
        path: "/finance/payroll/history",
        visible: access.canViewFinance,
      },
      {
        label: "المصروفات",
        path: "/finance/expenses",
        visible: access.canManageExpenses,
      },
      {
        label: "الخزينة",
        path: "/finance/treasury",
        visible: access.canViewFinance,
      },
      {
        label: "المطابقة",
        path: "/finance/treasury/reconciliation",
        visible: access.canViewFinance,
      },
      {
        label: "إقفال الفترة",
        path: "/finance/period-close",
        visible: access.canManageFinance,
      },
      {
        label: "القوائم المالية",
        path: "/finance/statements",
        visible: hasAnyAccess,
      },
      {
        label: "التقارير",
        path: "/finance/reports",
        visible: hasAnyAccess,
      },
    ].filter(link => link.visible);
  }, [access]);

  useLayoutEffect(() => {
    const navigation = navigationRef.current;
    if (!navigation) return;

    try {
      const stored = Number(window.sessionStorage.getItem(FINANCE_SCROLL_KEY));
      if (Number.isFinite(stored)) navigation.scrollLeft = stored;
    } catch {
      // Keep the current browser position.
    }

    const frame = window.requestAnimationFrame(() => {
      const activeLink = navigation.querySelector<HTMLElement>('[aria-current="page"]');
      if (!activeLink) return;
      const navigationRect = navigation.getBoundingClientRect();
      const linkRect = activeLink.getBoundingClientRect();
      if (linkRect.left < navigationRect.left || linkRect.right > navigationRect.right) {
        activeLink.scrollIntoView({ block: "nearest", inline: "nearest" });
        persistFinanceScroll(navigation.scrollLeft);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [currentPath, links.length]);

  if (loading) {
    return (
      <div
        role="status"
        aria-label="جارٍ تحميل التنقل المالي"
        className={`flex gap-2 overflow-hidden px-4 py-3 print:hidden md:px-6 ${className}`}
      >
        {[0, 1, 2, 3].map(item => (
          <span
            key={item}
            className="h-8 w-24 shrink-0 animate-pulse rounded-full bg-gray-100"
          />
        ))}
      </div>
    );
  }

  const showChargeManagement =
    currentPath === "/finance/charges" &&
    access.canManageFinance &&
    Boolean(school?.id);

  return (
    <>
      <nav
        ref={navigationRef}
        onScroll={event => persistFinanceScroll(event.currentTarget.scrollLeft)}
        aria-label="التنقل المالي"
        className={`flex w-full max-w-full gap-2 overflow-x-auto overscroll-x-contain border-b border-gray-100 bg-white px-4 py-3 print:hidden md:px-6 ${className}`}
      >
        {links.map(link => (
          <a
            key={link.path}
            href={link.path}
            onClick={event => {
              event.preventDefault();
              setLocation(link.path);
            }}
            aria-current={currentPath === link.path ? "page" : undefined}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              currentPath === link.path
                ? "bg-[#0B4738] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {link.label}
          </a>
        ))}
      </nav>
      {showChargeManagement && school?.id && (
        <>
          <StudentDiscountPolicyLauncher schoolId={school.id} />
          <RecurringBillingLauncher schoolId={school.id} />
        </>
      )}
    </>
  );
}
