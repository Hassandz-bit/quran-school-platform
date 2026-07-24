import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  BookOpen,
  CircleDollarSign,
  DollarSign,
  GraduationCap,
  Home,
  LogOut,
  Menu,
  ReceiptText,
  ScrollText,
  RefreshCw,
  Settings,
  ShieldAlert,
  Tags,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchFinanceDashboard,
  FinancePermissionError,
  formatDzd,
  type FinanceDashboardData,
} from "@/lib/finance";

type LoadState = "loading" | "ready" | "error" | "forbidden";

export default function FinanceDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [financeData, setFinanceData] = useState<FinanceDashboardData | null>(
    null
  );
  const [, setLocation] = useLocation();
  const { school, isSchoolAdmin, signOut } = useAuth();

  const loadFinance = useCallback(async () => {
    if (!school?.id) {
      setLoadState("error");
      return;
    }

    setLoadState("loading");

    try {
      const data = await fetchFinanceDashboard(school.id);
      setFinanceData(data);
      setLoadState("ready");
    } catch (error) {
      setFinanceData(null);
      setLoadState(
        error instanceof FinancePermissionError ? "forbidden" : "error"
      );
    }
  }, [school?.id]);

  useEffect(() => {
    void loadFinance();
  }, [loadFinance]);

  const handleLogout = async () => {
    try {
      const { error } = await signOut();
      if (error) {
        toast.error("تعذر تسجيل الخروج حاليًا. حاول مرة أخرى.");
        return;
      }
      setLocation("/login");
    } catch {
      toast.error("تعذر تسجيل الخروج حاليًا. حاول مرة أخرى.");
    }
  };

  const menuItems = useMemo(
    () => [
      {
        label: "لوحة التحكم",
        icon: Home,
        path: isSchoolAdmin ? "/dashboard" : null,
      },
      {
        label: "الطلاب",
        icon: Users,
        path: isSchoolAdmin ? "/students" : null,
      },
      {
        label: "المعلمون",
        icon: GraduationCap,
        path: isSchoolAdmin ? "/teachers" : null,
      },
      {
        label: "الحلقات",
        icon: BookOpen,
        path: isSchoolAdmin ? "/classes" : null,
      },
      { label: "المالية", icon: DollarSign, path: "/finance" },
      { label: "الإعدادات", icon: Settings, path: null },
    ],
    [isSchoolAdmin]
  );

  const summaryCards = financeData
    ? [
        {
          label: "الرسوم المستحقة",
          value: formatDzd(financeData.dueFees),
          helper: `${financeData.chargeCount} استحقاق`,
          icon: CircleDollarSign,
          iconClass: "bg-[#0B4738]/10 text-[#0B4738]",
        },
        {
          label: "المبالغ المحصلة",
          value: formatDzd(financeData.collected),
          helper: `${financeData.paymentCount} دفعة`,
          icon: Banknote,
          iconClass: "bg-emerald-50 text-emerald-700",
        },
        {
          label: "المتبقي",
          value: formatDzd(financeData.remaining),
          helper: "بعد خصم الدفعات المكتملة",
          icon: WalletCards,
          iconClass: "bg-amber-50 text-amber-700",
        },
        {
          label: "المصروفات",
          value: formatDzd(financeData.expenses),
          helper: `${financeData.expenseCount} مصروف`,
          icon: ReceiptText,
          iconClass: "bg-rose-50 text-rose-700",
        },
      ]
    : [];

  const SidebarContent = ({ showLabels }: { showLabels: boolean }) => (
    <>
      <div className="border-b border-white/10 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#C8A26A]">
            <span className="text-lg font-bold text-[#0B4738]">ق</span>
          </div>
          {showLabels && (
            <span className="line-clamp-2 text-sm font-semibold text-white">
              {school?.name ?? "المدرسة القرآنية"}
            </span>
          )}
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {menuItems.map(item => {
          const itemContent = (
            <>
              <item.icon size={20} className="shrink-0" />
              {showLabels && (
                <span className="text-sm font-medium">{item.label}</span>
              )}
            </>
          );

          if (!item.path) {
            return (
              <div
                key={item.label}
                className="flex cursor-not-allowed items-center gap-3 rounded-lg px-4 py-3 text-white/40"
                aria-disabled="true"
              >
                {itemContent}
              </div>
            );
          }

          return (
            <a
              key={item.label}
              href={item.path}
              onClick={event => {
                event.preventDefault();
                setLocation(item.path!);
                setMobileSidebarOpen(false);
              }}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-all duration-200 ${
                item.path === "/finance"
                  ? "bg-white/15 text-white"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              {itemContent}
            </a>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-white/70 transition-all hover:bg-red-500/20 hover:text-white"
        >
          <LogOut size={20} className="shrink-0" />
          {showLabels && <span className="text-sm font-medium">تسجيل الخروج</span>}
        </button>
      </div>
    </>
  );

  const renderContent = () => {
    if (loadState === "loading") {
      return (
        <div aria-label="جارٍ تحميل ملخص المالية" role="status">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map(item => (
              <Card
                key={item}
                className="h-36 animate-pulse border border-gray-100 bg-white p-5"
              >
                <div className="h-4 w-28 rounded bg-gray-100" />
                <div className="mt-5 h-7 w-36 rounded bg-gray-100" />
                <div className="mt-4 h-3 w-24 rounded bg-gray-100" />
              </Card>
            ))}
          </div>
        </div>
      );
    }

    if (loadState === "forbidden") {
      return (
        <Card
          role="alert"
          className="border border-amber-200 bg-white p-10 text-center"
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-700">
            <ShieldAlert size={28} aria-hidden="true" />
          </div>
          <h2 className="mt-5 text-lg font-bold text-[#2C3E50]">
            لا تملك صلاحية عرض المالية
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-7 text-gray-600">
            يلزم منح الحساب صلاحية finance.view أو finance.manage على المدرسة
            أو أحد فروعها.
          </p>
        </Card>
      );
    }

    if (loadState === "error" || !financeData) {
      return (
        <Card
          role="alert"
          className="border border-red-100 bg-white p-10 text-center"
        >
          <p className="mb-4 text-red-700">
            تعذر تحميل بيانات المالية حاليًا.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadFinance()}
            className="gap-2"
          >
            <RefreshCw size={16} />
            إعادة المحاولة
          </Button>
        </Card>
      );
    }

    return (
      <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map(card => (
            <Card
              key={card.label}
              className="border border-gray-100 bg-white p-5 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-500">{card.label}</p>
                  <p
                    className="mt-2 break-words text-xl font-bold text-[#2C3E50]"
                    dir="rtl"
                  >
                    {card.value}
                  </p>
                  <p className="mt-2 text-xs text-gray-400">{card.helper}</p>
                </div>
                <div className={`shrink-0 rounded-xl p-3 ${card.iconClass}`}>
                  <card.icon size={22} aria-hidden="true" />
                </div>
              </div>
            </Card>
          ))}
        </div>

        {!financeData.hasData && (
          <Card className="mt-6 border border-dashed border-[#C8A26A]/60 bg-[#C8A26A]/5 p-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-[#9A7137] shadow-sm">
              <ReceiptText size={26} aria-hidden="true" />
            </div>
            <h2 className="mt-5 text-lg font-bold text-[#2C3E50]">
              لا توجد بيانات مالية بعد
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-gray-600">
              ستظهر هنا الرسوم والدفعات والمصروفات تلقائيًا عند توفرها في
              قاعدة البيانات.
            </p>
          </Card>
        )}

        <Card className="mt-6 border border-gray-100 bg-white p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-[#C8A26A]/15 p-3 text-[#9A7137]">
                <Tags size={22} aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-bold text-[#2C3E50]">خطط الرسوم</h2>
                <p className="mt-1 text-sm leading-6 text-gray-500">
                  عرض وإدارة الخطط العامة للمدرسة والخطط الخاصة بالفروع.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLocation("/finance/fee-plans")}
              className="border-[#0B4738]/20 text-[#0B4738] hover:bg-[#0B4738]/5"
            >
              فتح خطط الرسوم
            </Button>
          </div>
        </Card>

        <Card className="mt-4 border border-gray-100 bg-white p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-[#0B4738]/10 p-3 text-[#0B4738]">
                <CircleDollarSign size={22} aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-bold text-[#2C3E50]">
                  استحقاقات الطلاب
                </h2>
                <p className="mt-1 text-sm leading-6 text-gray-500">
                  عرض الرسوم والخصومات وإنشاء الاستحقاقات ضمن الفروع المصرح
                  بها.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLocation("/finance/charges")}
              className="border-[#0B4738]/20 text-[#0B4738] hover:bg-[#0B4738]/5"
            >
              فتح الاستحقاقات
            </Button>
          </div>
        </Card>

        <Card className="mt-4 border border-gray-100 bg-white p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-sky-50 p-3 text-sky-700">
                <ScrollText size={22} aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-bold text-[#2C3E50]">
                  التقارير المالية
                </h2>
                <p className="mt-1 text-sm leading-6 text-gray-500">
                  الاستحقاقات والتحصيلات والمتأخرات والمصروفات وصافي التدفق
                  حسب الصلاحيات الفعلية.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLocation("/finance/reports")}
              className="border-sky-200 text-sky-700 hover:bg-sky-50"
            >
              فتح التقارير
            </Button>
          </div>
        </Card>

        <Card className="mt-4 border border-gray-100 bg-white p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
                <Banknote size={22} aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-bold text-[#2C3E50]">
                  الدفعات والتحصيل
                </h2>
                <p className="mt-1 text-sm leading-6 text-gray-500">
                  تسجيل الدفعات الجزئية والكاملة وعكس القيود مع حفظ السجل
                  المحاسبي.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLocation("/finance/payments")}
              className="border-[#0B4738]/20 text-[#0B4738] hover:bg-[#0B4738]/5"
            >
              فتح الدفعات
            </Button>
          </div>
        </Card>

        {financeData.hasData && (
          <Card className="mt-6 border border-gray-100 bg-white p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-bold text-[#2C3E50]">
                  حالة الوصول المالي
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  تُعرض البيانات ضمن المدرسة والفروع المصرح بها فقط.
                </p>
              </div>
              <span className="w-fit rounded-full bg-[#0B4738]/10 px-3 py-1.5 text-xs font-semibold text-[#0B4738]">
                {financeData.canManage ? "صلاحية الإدارة متاحة" : "عرض فقط"}
              </span>
            </div>
          </Card>
        )}
      </>
    );
  };

  return (
    <div className="flex min-h-screen bg-[#F8F9FA]" dir="rtl">
      <aside
        className={`hidden flex-col shadow-xl transition-all duration-300 md:flex ${
          sidebarOpen ? "w-64" : "w-20"
        }`}
        style={{ backgroundColor: "#0B4738" }}
      >
        <SidebarContent showLabels={sidebarOpen} />
      </aside>

      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="إغلاق القائمة"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside
            className="absolute bottom-0 right-0 top-0 flex w-72 flex-col shadow-xl"
            style={{ backgroundColor: "#0B4738" }}
          >
            <SidebarContent showLabels />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-4 shadow-sm md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="تبديل القائمة"
              onClick={() => {
                if (window.innerWidth < 768) {
                  setMobileSidebarOpen(open => !open);
                } else {
                  setSidebarOpen(open => !open);
                }
              }}
              className="rounded-lg p-2 transition-colors hover:bg-gray-100"
            >
              {mobileSidebarOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-[#2C3E50]">
                ملخص المالية
              </h1>
              <p className="mt-0.5 truncate text-xs text-gray-500">
                نظرة فورية على الاستحقاقات والتحصيل والمصروفات
              </p>
            </div>
          </div>

          {financeData && loadState === "ready" && (
            <span className="hidden rounded-full bg-[#0B4738]/10 px-3 py-1.5 text-xs font-semibold text-[#0B4738] sm:inline-flex">
              {financeData.canManage ? "إدارة مالية" : "عرض المالية"}
            </span>
          )}
        </header>

        <main className="flex-1 p-4 md:p-6">{renderContent()}</main>
      </div>
    </div>
  );
}
