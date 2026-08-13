import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/contexts/LocaleContext";

export default function StaffPayrollNavigation({ currentPath }: { currentPath: string }) {
  const [, setLocation] = useLocation();
  const { locale } = useLocale();
  const en = locale === "en";
  const links = [
    { path: "/staff", label: en ? "Employee directory" : "دليل الموظفين" },
    { path: "/staff/payroll", label: en ? "Payroll" : "الرواتب" },
    { path: "/staff/payroll/history", label: en ? "Payroll history" : "سجل الأجور" },
    { path: "/finance", label: en ? "Finance" : "المالية" },
  ];

  return (
    <nav className="flex gap-2 overflow-x-auto rounded-2xl border bg-white p-2" aria-label={en ? "Employees and payroll" : "الموظفون والرواتب"}>
      {links.map(link => (
        <Button
          key={link.path}
          type="button"
          variant={currentPath === link.path ? "default" : "ghost"}
          className="shrink-0"
          onClick={() => setLocation(link.path)}
        >
          {link.label}
        </Button>
      ))}
    </nav>
  );
}
