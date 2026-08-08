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
import AppShell from "./components/AppShell";
import { captureTeacherInviteSession } from "./lib/invite-session";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
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
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const RosterAssignmentLauncher = lazy(
  () => import("./components/RosterAssignmentLauncher")
);

function ModuleFallback({ label }: { label: string }) {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-[#F7F8F3] p-4 text-[#173B2D]"
      dir="rtl"
    >
      <div className="flex items-center gap-3" role="status">
        <span className="size-5 animate-spin rounded-full border-2 border-[#17663B]/30 border-t-[#17663B]" />
        <span className="text-sm font-medium">{label}</span>
      </div>
    </main>
  );
}

function FinancePageFallback() {
  return <ModuleFallback label="جارٍ تحميل الوحدة المالية..." />;
}

function AttendancePageFallback() {
  return <ModuleFallback label="جارٍ تحميل وحدة الحضور..." />;
}

function MemorizationPageFallback() {
  return <ModuleFallback label="جارٍ تحميل وحدة متابعة الحفظ..." />;
}

function Student360PageFallback() {
  return <ModuleFallback label="جارٍ تحميل ملف الطالب..." />;
}

function MembersPageFallback() {
  return <ModuleFallback label="جارٍ تحميل دليل أعضاء المدرسة..." />;
}

function AcceptInvitePageFallback() {
  return <ModuleFallback label="جارٍ تحميل صفحة قبول الدعوة..." />;
}

function Shell({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}

captureTeacherInviteSession();

function Router() {
  return (
    <Suspense fallback={<FinancePageFallback />}>
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/post-login" component={PostLoginRedirect} />
        <Route path="/accept-invite">
          <Suspense fallback={<AcceptInvitePageFallback />}>
            <AcceptInvite />
          </Suspense>
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
        <Route path="/"><Redirect to="/login" /></Route>
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ThemeProvider defaultTheme="light">
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </ThemeProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
