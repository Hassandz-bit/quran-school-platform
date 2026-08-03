import { lazy, Suspense } from "react";
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

function FinancePageFallback() {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-[#F8F9FA] p-4 text-[#2C3E50]"
      dir="rtl"
    >
      <div className="flex items-center gap-3" role="status">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#0B4738]/30 border-t-[#0B4738]" />
        <span className="text-sm font-medium">
          جارٍ تحميل الوحدة المالية...
        </span>
      </div>
    </main>
  );
}

function AttendancePageFallback() {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-[#F8F9FA] p-4 text-[#2C3E50]"
      dir="rtl"
    >
      <div className="flex items-center gap-3" role="status">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#0B4738]/30 border-t-[#0B4738]" />
        <span className="text-sm font-medium">
          جارٍ تحميل وحدة الحضور...
        </span>
      </div>
    </main>
  );
}

function MemorizationPageFallback() {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-[#F8F9FA] p-4 text-[#2C3E50]"
      dir="rtl"
    >
      <div className="flex items-center gap-3" role="status">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#0B4738]/30 border-t-[#0B4738]" />
        <span className="text-sm font-medium">
          جارٍ تحميل وحدة متابعة الحفظ...
        </span>
      </div>
    </main>
  );
}

function MembersPageFallback() {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-[#F8F9FA] p-4 text-[#2C3E50]"
      dir="rtl"
    >
      <div className="flex items-center gap-3" role="status">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#0B4738]/30 border-t-[#0B4738]" />
        <span className="text-sm font-medium">
          جارٍ تحميل دليل أعضاء المدرسة...
        </span>
      </div>
    </main>
  );
}

function AcceptInvitePageFallback() {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-[#0B4738] p-4 text-white"
      dir="rtl"
    >
      <div className="flex items-center gap-3" role="status">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        <span className="text-sm font-medium">
          جارٍ تحميل صفحة قبول الدعوة...
        </span>
      </div>
    </main>
  );
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
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        </Route>
        <Route path="/students">
          <ProtectedRoute>
            <StudentsList />
            <Suspense fallback={null}>
              <RosterAssignmentLauncher mode="student-class" />
            </Suspense>
          </ProtectedRoute>
        </Route>
        <Route path="/students/new">
          <ProtectedRoute>
            <AddStudentForm />
          </ProtectedRoute>
        </Route>
        <Route path="/classes">
          <ProtectedRoute>
            <ClassesList />
            <Suspense fallback={null}>
              <RosterAssignmentLauncher mode="class-teacher" />
            </Suspense>
          </ProtectedRoute>
        </Route>
        <Route path="/classes/new">
          <ProtectedRoute>
            <AddClassForm />
          </ProtectedRoute>
        </Route>
        <Route path="/teachers">
          <ProtectedRoute>
            <TeachersList />
          </ProtectedRoute>
        </Route>
        <Route path="/teachers/new">
          <ProtectedRoute>
            <AddTeacherForm />
          </ProtectedRoute>
        </Route>
        <Route path="/finance">
          <FinanceRoute>
            <FinanceDashboard />
          </FinanceRoute>
        </Route>
        <Route path="/finance/fee-plans">
          <FinanceRoute>
            <FeePlans />
          </FinanceRoute>
        </Route>
        <Route path="/finance/charges">
          <FinanceRoute>
            <StudentCharges />
          </FinanceRoute>
        </Route>
        <Route path="/finance/payments">
          <FinanceRoute>
            <Payments />
          </FinanceRoute>
        </Route>
        <Route path="/finance/expenses">
          <FinanceRoute>
            <Expenses />
          </FinanceRoute>
        </Route>
        <Route path="/finance/reports">
          <FinanceRoute>
            <FinancialReports />
          </FinanceRoute>
        </Route>
        <Route path="/attendance">
          <AttendanceRoute>
            <Suspense fallback={<AttendancePageFallback />}>
              <Attendance />
            </Suspense>
          </AttendanceRoute>
        </Route>
        <Route path="/memorization">
          <MemorizationRoute>
            <Suspense fallback={<MemorizationPageFallback />}>
              <Memorization />
            </Suspense>
          </MemorizationRoute>
        </Route>
        <Route path="/members">
          <MembersRoute>
            <Suspense fallback={<MembersPageFallback />}>
              <Members />
            </Suspense>
          </MembersRoute>
        </Route>
        <Route path="/">
          <Redirect to="/login" />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
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

export default App;
