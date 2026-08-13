import { useCallback, useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, Pencil, Plus, RefreshCw, Search, UserRoundCheck, UserRoundX } from "lucide-react";
import { toast } from "sonner";
import StaffPayrollNavigation from "@/components/StaffPayrollNavigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import {
  STAFF_JOB_CODES,
  STAFF_JOB_LABELS,
  fetchEmployees,
  getEmployeeJobLabel,
  saveEmployee,
  setEmployeeStatus,
  type Employee,
  type StaffJobCode,
} from "@/lib/employees";
import { fetchPayrollScopes, type PayrollScope } from "@/lib/payroll";

const emptyForm = {
  id: "",
  fullName: "",
  jobCode: "teacher" as StaffJobCode,
  customJobTitle: "",
  employeeNumber: "",
  phone: "",
  hireDate: "",
  notes: "",
};

export default function Employees() {
  const { school } = useAuth();
  const { locale, direction } = useLocale();
  const en = locale === "en";
  const [scopes, setScopes] = useState<PayrollScope[]>([]);
  const [scopeKey, setScopeKey] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const selectedScope = useMemo(
    () => scopes.find(scope => (scope.branchId ?? "school") === scopeKey) ?? null,
    [scopeKey, scopes]
  );

  const loadScopes = useCallback(async () => {
    if (!school?.id) return;
    const next = await fetchPayrollScopes(school.id);
    setScopes(next);
    setScopeKey(current => current || (next[0]?.branchId ?? "school"));
  }, [school?.id]);

  const loadEmployees = useCallback(async () => {
    if (!school?.id || !selectedScope) return;
    setLoading(true);
    try {
      setEmployees(await fetchEmployees(school.id, selectedScope.branchId));
    } catch {
      toast.error(en ? "Could not load employees." : "تعذر تحميل الموظفين.");
    } finally {
      setLoading(false);
    }
  }, [en, school?.id, selectedScope]);

  useEffect(() => { void loadScopes(); }, [loadScopes]);
  useEffect(() => { void loadEmployees(); setForm(emptyForm); }, [loadEmployees]);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return employees;
    return employees.filter(employee =>
      [employee.fullName, employee.employeeNumber, employee.phone, getEmployeeJobLabel(employee, locale)]
        .filter(Boolean)
        .some(value => String(value).toLocaleLowerCase().includes(term))
    );
  }, [employees, locale, query]);

  const edit = (employee: Employee) => setForm({
    id: employee.id,
    fullName: employee.fullName,
    jobCode: employee.jobCode,
    customJobTitle: employee.customJobTitle ?? "",
    employeeNumber: employee.employeeNumber ?? "",
    phone: employee.phone ?? "",
    hireDate: employee.hireDate ?? "",
    notes: employee.notes ?? "",
  });

  const submit = async () => {
    if (!school?.id || !selectedScope || form.fullName.trim().length < 2
      || (form.jobCode === "other" && form.customJobTitle.trim().length < 2)) {
      toast.error(en ? "Enter the employee name and job." : "أدخل اسم الموظف ووظيفته بصورة صحيحة.");
      return;
    }
    setSaving(true);
    try {
      await saveEmployee({
        schoolId: school.id,
        employeeId: form.id || null,
        branchId: selectedScope.branchId,
        fullName: form.fullName,
        jobCode: form.jobCode,
        customJobTitle: form.customJobTitle,
        employeeNumber: form.employeeNumber,
        phone: form.phone,
        hireDate: form.hireDate,
        notes: form.notes,
      });
      toast.success(en ? "Employee saved." : "تم حفظ الموظف.");
      setForm(emptyForm);
      await loadEmployees();
    } catch {
      toast.error(en ? "Could not save the employee." : "تعذر حفظ الموظف. تحقق من الرقم الوظيفي والبيانات.");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (employee: Employee) => {
    if (!school?.id) return;
    setSaving(true);
    try {
      await setEmployeeStatus(school.id, employee.id, employee.status === "active" ? "inactive" : "active");
      await loadEmployees();
    } catch {
      toast.error(en ? "Could not change employee status." : "تعذر تغيير حالة الموظف.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5" dir={direction}>
      <StaffPayrollNavigation currentPath="/staff" />
      <header className="rounded-2xl border border-[#DDE8DF] bg-white p-5">
        <p className="text-xs font-bold text-[#17663B]">{en ? "Management" : "الإدارة"}</p>
        <h1 className="mt-1 text-2xl font-bold text-[#173B2D]">{en ? "Employees and payroll" : "الموظفون والرواتب"}</h1>
        <p className="mt-1 text-sm text-[#607368]">
          {en ? "Create employment records without creating login accounts. Payroll remains connected to Finance."
            : "أنشئ سجل الموظف دون إنشاء حساب دخول. الرواتب متصلة بالمالية محاسبيًا."}
        </p>
      </header>

      <Card className="grid gap-3 p-4 md:grid-cols-3">
        <label className="text-xs font-bold">
          {en ? "Scope" : "النطاق"}
          <select value={scopeKey} onChange={event => setScopeKey(event.target.value)} className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm">
            {scopes.map(scope => <option key={scope.branchId ?? "school"} value={scope.branchId ?? "school"}>{scope.label}</option>)}
          </select>
        </label>
        <label className="relative text-xs font-bold md:col-span-2">
          {en ? "Search" : "البحث"}
          <Search className="absolute bottom-2.5 start-3 size-4 text-gray-400" />
          <Input value={query} onChange={event => setQuery(event.target.value)} className="mt-1 ps-9" placeholder={en ? "Name, job, number or phone" : "الاسم، الوظيفة، الرقم أو الهاتف"} />
        </label>
      </Card>

      {selectedScope?.canManage ? (
        <Card className="p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-bold text-[#173B2D]">{form.id ? (en ? "Edit employee" : "تعديل الموظف") : (en ? "Add employee" : "إضافة موظف")}</h2>
            {form.id ? <Button type="button" variant="ghost" onClick={() => setForm(emptyForm)}>{en ? "New" : "موظف جديد"}</Button> : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-bold">{en ? "Full name" : "الاسم الكامل"}<Input className="mt-1" value={form.fullName} onChange={event => setForm(current => ({...current, fullName: event.target.value}))} /></label>
            <label className="text-xs font-bold">{en ? "Job" : "الوظيفة"}<select className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm" value={form.jobCode} onChange={event => setForm(current => ({...current, jobCode: event.target.value as StaffJobCode, customJobTitle: ""}))}>{STAFF_JOB_CODES.map(code => <option key={code} value={code}>{STAFF_JOB_LABELS[code][locale]}</option>)}</select></label>
            {form.jobCode === "other" ? <label className="text-xs font-bold">{en ? "Custom job" : "مسمى آخر"}<Input className="mt-1" value={form.customJobTitle} onChange={event => setForm(current => ({...current, customJobTitle: event.target.value}))} /></label> : null}
            <label className="text-xs font-bold">{en ? "Employee number" : "الرقم الوظيفي"}<Input className="mt-1" value={form.employeeNumber} onChange={event => setForm(current => ({...current, employeeNumber: event.target.value}))} /></label>
            <label className="text-xs font-bold">{en ? "Phone" : "الهاتف"}<Input className="mt-1" value={form.phone} onChange={event => setForm(current => ({...current, phone: event.target.value}))} /></label>
            <label className="text-xs font-bold">{en ? "Hire date" : "تاريخ التوظيف"}<Input className="mt-1" type="date" value={form.hireDate} onChange={event => setForm(current => ({...current, hireDate: event.target.value}))} /></label>
            <label className="text-xs font-bold sm:col-span-2">{en ? "Notes" : "ملاحظات"}<Input className="mt-1" maxLength={500} value={form.notes} onChange={event => setForm(current => ({...current, notes: event.target.value}))} /></label>
            <Button type="button" onClick={() => void submit()} disabled={saving} className="self-end gap-2"><Plus className="size-4" />{form.id ? (en ? "Save changes" : "حفظ التعديل") : (en ? "Add employee" : "إضافة الموظف")}</Button>
          </div>
        </Card>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {loading ? <Card className="col-span-full p-10 text-center"><RefreshCw className="mx-auto mb-2 animate-spin" />{en ? "Loading employees..." : "جارٍ تحميل الموظفين..."}</Card>
          : filtered.length === 0 ? <Card className="col-span-full p-10 text-center text-sm text-gray-500">{en ? "No employees in this scope." : "لا يوجد موظفون في هذا النطاق."}</Card>
          : filtered.map(employee => (
            <Card key={employee.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div><strong className="block text-[#173B2D]">{employee.fullName}</strong><span className="text-sm text-[#17663B]">{getEmployeeJobLabel(employee, locale)}</span></div>
                {employee.status === "active" ? <UserRoundCheck className="text-emerald-600" /> : <UserRoundX className="text-gray-400" />}
              </div>
              <div className="mt-3 space-y-1 text-xs text-gray-500">
                <p>{employee.employeeNumber ? `${en ? "No." : "الرقم"}: ${employee.employeeNumber}` : (en ? "No employee number" : "دون رقم وظيفي")}</p>
                <p>{employee.phone || (en ? "No phone" : "دون هاتف")}</p>
                <p>{employee.hireDate ? `${en ? "Hired" : "تاريخ التوظيف"}: ${employee.hireDate}` : ""}</p>
              </div>
              {selectedScope?.canManage ? <div className="mt-4 flex gap-2"><Button size="sm" variant="outline" onClick={() => edit(employee)}><Pencil className="size-4" />{en ? "Edit" : "تعديل"}</Button><Button size="sm" variant="outline" disabled={saving} onClick={() => void changeStatus(employee)}>{employee.status === "active" ? (en ? "Deactivate" : "تعطيل") : (en ? "Activate" : "تفعيل")}</Button></div> : null}
            </Card>
          ))}
      </section>
      <Card className="border-[#C8A26A]/30 bg-[#C8A26A]/10 p-4 text-sm text-[#69491F]"><BriefcaseBusiness className="me-2 inline size-4" />{en ? "Employment jobs describe work only; they never grant system permissions." : "الوظيفة تصف عمل الموظف فقط ولا تمنحه صلاحيات في النظام."}</Card>
    </div>
  );
}
