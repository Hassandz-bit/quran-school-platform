import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import ProtectedRoute from "./components/ProtectedRoute";
import FinanceRoute from "./components/FinanceRoute";
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
import FinanceDashboard from "./pages/FinanceDashboard";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/dashboard">
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/students">
        <ProtectedRoute>
          <StudentsList />
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
      <Route path="/">
        <Redirect to="/login" />
      </Route>
      <Route component={NotFound} />
    </Switch>
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
