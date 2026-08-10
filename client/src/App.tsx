import { lazy, Suspense, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import ProtectedRoute from "./components/ProtectedRoute";
import FinanceRoute from "./components/FinanceRoute";
import AttendanceRoute from "./components/AttendanceRoute";
import MemorizationRoute from "./components/MemorizationRoute";
import MembersRoute from "./components/MembersRoute";
import AcademicReportsRoute from "./components/AcademicReportsRoute";
import LoginRoute from "./components/LoginRoute";
import ParentRoute from "./components/ParentRoute";
import AppShell from "./components/AppShell";
import ParentShell from "./components/ParentShell";
import {
  captureGuardianInviteSession,
  captureTeacherInviteSession,
} from "./lib/invite-session";
import { AuthProvider } from "./contexts/AuthContext";
import { LocaleProvider, useLocale } from "./contexts/LocaleContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import type { TranslationKey } from "./lib/locale";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import StudentsList from "./pages/StudentsList";
import AddStudentForm from "./pages/AddStudentForm";
import ClassesList from "./pages/ClassesList";
import AddClassForm from "./pages/AddClassForm";
import TeachersList from "./pages/TeachersList";
import AddTeacherForm from "./pages/AddTeacherForm";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import PostLoginRedirect from "./pages/PostLoginRedirect";

const FinanceDashboard = lazy(() => import("./pages/FinanceDashboard"));
const FeePlans = lazy(() => import("./pages/FeePlans"));
const StudentCharges = lazy(() => import("./pages/StudentCharges"));
const Payments = lazy(() => import("./pages/Payments"));
const Expenses = lazy(() => import("./pages/Expenses"));
const FinancialReports = lazy(() => import("./pages/FinancialReports"));
const Attendance = lazy(() => import("./pages/Attendance"));
const Memorization = lazy(() => import("./pages/Memorization"));
const Members = lazy(() => import("./pages/Members"));
const Guardians = lazy(() => import("./pages/Guardians"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Settings = lazy(() => import("./pages/Settings"));
const Student360 = lazy(() => import("./pages/Student360"));
const AcademicReports = lazy(() => import("./pages/AcademicReports"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const AcceptGuardianInvite = lazy(
  () => import("./pages/AcceptGuardianInvite")
);
const ParentHome = lazy(() => import("./pages/ParentHome"));
const ParentStudent = lazy(() => import("./pages/ParentStudent"));
const RosterAssignmentLauncher = lazy(
  () => import("./components/RosterAssignmentLauncher")
);

const ARABIC_MODULE_FALLBACKS: Partial<Record<TranslationKey, string>> = {
  "fallback.finance": "جارٍ تحميل الوحدة المالية...",
  "fallback.attendance": "جارٍ تحميل وحدة الحضور...",
  "fallback.memorization": "جارٍ تحميل وحدة متابعة الحفظ...",
  "fallback.members": "جارٍ تحميل دليل أعضاء المدرسة...",
};

function ModuleFallback({ labelKey }: { labelKey: TranslationKey }) {
  const { locale, direction, t } = useLocale();
  const label =
    locale === "ar" ? (ARABIC_MODULE_FALLBACKS[labelKey] ?? t(labelKey)) : t(labelKey);

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-[#F7F8F3] p-4 text-[#173B2D]"
      dir={direction}
    >
      <div className="flex items-center gap-3" role="status">
        <span className="size-5 animate-spin rounded-full border-2 border-[#17663B]/30 border-t-[#17663B]" />
        <span className="text-sm font-medium">{label}</span>
      </div>
    </main>
  );
}

function FinancePageFallback() {
  return <ModuleFallback labelKey="fallback.finance" />;
}

function AttendancePageFallback() {
  return <ModuleFallback labelKey="fallback.attendance" />;
}

function MemorizationPageFallback() {
  return <ModuleFallback labelKey="fallback.memorization" />;
}

function Student360PageFallback() {
  return <ModuleFallback labelKey="fallback.student" />;
}

function AcademicReportsPageFallback() {
  return <ModuleFallback labelKey="fallback.academicReports" />;
}

function MembersPageFallback() {
  return <ModuleFallback labelKey="fallback.members" />;
}

function AcceptInvitePageFallback() {
  return <ModuleFallback labelKey="fallback.invite" />;
}

function ParentPageFallback() {
  return <ModuleFallback labelKey="fallback.parent" />;
}

function NotificationsPageFallback() {
  return <ModuleFallback labelKey="fallback.notifications" />;
}

function SettingsPageFallback() {
  return <ModuleFallback labelKey="fallback.settings" />;
}

function Shell({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}

captureTeacherInviteSession();
captureGuardianInviteSession();

function Router() {
  return (
    <Suspense fallback={<FinancePageFallback />}>
      <Switch>
        <Route path="/login">
          <LoginRoute>
            <Login />
          </LoginRoute>
        </Route>
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/post-login" component={PostLoginRedirect} />
        <Route path="/accept-invite">
          <Suspense fallback={<AcceptInvitePageFallback />}>
            <AcceptInvite />
          </Suspense>
        </Route>
        <Route path="/accept-guardian-invite">
          <Suspense fallback={<AcceptInvitePageFallback />}>
            <AcceptGuardianInvite />
          </Suspense>
        </Route>
        <Route path="/parent/notifications">
          <ParentRoute>
            <ParentShell>
              <Suspense fallback={<NotificationsPageFallback />}>
                <Notifications />
              </Suspense>
            </ParentShell>
          </ParentRoute>
        </Route>
        <Route path="/parent/settings">
          <ParentRoute>
            <ParentShell>
              <Suspense fallback={<SettingsPageFallback />}>
                <Settings />
              </Suspense>
            </ParentShell>
          </ParentRoute>
        </Route>
        <Route path="/parent/students/:studentId">
          <ParentRoute>
            <ParentShell>
              <Suspense fallback={<ParentPageFallback />}>
                <ParentStudent />
              </Suspense>
            </ParentShell>
          </ParentRoute>
        </Route>
        <Route path="/parent">
          <ParentRoute>
            <ParentShell>
              <Suspense fallback={<ParentPageFallback />}>
                <ParentHome />
              </Suspense>
            </ParentShell>
          </ParentRoute>
        </Route>
        <Route path="/dashboard">
          <ProtectedRoute><Shell><Dashboard /></Shell></ProtectedRoute>
        </Route>
        <Route path="/students/:studentId">
          <ProtectedRoute>
            <Shell>
              <Suspense fallback={<Student360PageFallback />}>
                <Student360 />
              </Suspense>
            </Shell>
          </ProtectedRoute>
        </Route>
        <Route path="/students">
          <ProtectedRoute>
            <Shell>
              <StudentsList />
              <Suspense fallback={null}>
                <RosterAssignmentLauncher mode="student-class" />
              </Suspense>
            </Shell>
          </ProtectedRoute>
        </Route>
        <Route path="/students/new">
          <ProtectedRoute><Shell><AddStudentForm /></Shell></ProtectedRoute>
        </Route>
        <Route path="/classes">
          <ProtectedRoute>
            <Shell>
              <ClassesList />
              <Suspense fallback={null}>
                <RosterAssignmentLauncher mode="class-teacher" />
              </Suspense>
            </Shell>
          </ProtectedRoute>
        </Route>
        <Route path="/classes/new">
          <ProtectedRoute><Shell><AddClassForm /></Shell></ProtectedRoute>
        </Route>
        <Route path="/teachers">
          <ProtectedRoute><Shell><TeachersList /></Shell></ProtectedRoute>
        </Route>
        <Route path="/teachers/new">
          <ProtectedRoute><Shell><AddTeacherForm /></Shell></ProtectedRoute>
        </Route>
        <Route path="/guardians">
          <ProtectedRoute>
            <Shell>
              <Suspense fallback={<ParentPageFallback />}>
                <Guardians />
              </Suspense>
            </Shell>
          </ProtectedRoute>
        </Route>
        <Route path="/notifications">
          <ProtectedRoute>
            <Shell>
              <Suspense fallback={<NotificationsPageFallback />}>
                <Notifications />
              </Suspense>
            </Shell>
          </ProtectedRoute>
        </Route>
        <Route path="/settings">
          <ProtectedRoute>
            <Shell>
              <Suspense fallback={<SettingsPageFallback />}>
                <Settings />
              </Suspense>
            </Shell>
          </ProtectedRoute>
        </Route>
        <Route path="/finance">
          <FinanceRoute><Shell><FinanceDashboard /></Shell></FinanceRoute>
        </Route>
        <Route path="/finance/fee-plans">
          <FinanceRoute><Shell><FeePlans /></Shell></FinanceRoute>
        </Route>
        <Route path="/finance/charges">
          <FinanceRoute><Shell><StudentCharges /></Shell></FinanceRoute>
        </Route>
        <Route path="/finance/payments">
          <FinanceRoute><Shell><Payments /></Shell></FinanceRoute>
        </Route>
        <Route path="/finance/expenses">
          <FinanceRoute><Shell><Expenses /></Shell></FinanceRoute>
        </Route>
        <Route path="/finance/reports">
          <FinanceRoute><Shell><FinancialReports /></Shell></FinanceRoute>
        </Route>
        <Route path="/attendance">
          <AttendanceRoute>
            <Shell>
              <Suspense fallback={<AttendancePageFallback />}>
                <Attendance />
              </Suspense>
            </Shell>
          </AttendanceRoute>
        </Route>
        <Route path="/academic-reports">
          <AcademicReportsRoute>
            <Shell>
              <Suspense fallback={<AcademicReportsPageFallback />}>
                <AcademicReports />
              </Suspense>
            </Shell>
          </AcademicReportsRoute>
        </Route>
        <Route path="/memorization">
          <MemorizationRoute>
            <Shell>
              <Suspense fallback={<MemorizationPageFallback />}>
                <Memorization />
              </Suspense>
            </Shell>
          </MemorizationRoute>
        </Route>
        <Route path="/members">
          <MembersRoute>
            <Shell>
              <Suspense fallback={<MembersPageFallback />}>
                <Members />
              </Suspense>
            </Shell>
          </MembersRoute>
        </Route>
        <Route path="/"><Redirect to="/post-login" /></Route>
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <LocaleProvider>
          <ThemeProvider defaultTheme="light">
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </ThemeProvider>
        </LocaleProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
