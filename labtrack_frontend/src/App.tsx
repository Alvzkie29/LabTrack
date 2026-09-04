/// <reference types="vite/client" />

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/api/queryClient";
import { AuthProvider } from "@/contexts/AuthContext";
import { RoleProvider } from "@/contexts/RoleContext";
import { RequireAuth } from "@/components/RequireAuth";

import { StaffLoginPage } from "@/pages/auth/StaffLogin";
import { StudentLoginPage } from "@/pages/auth/StudentLogin";

import { AppLayout } from "@/pages/client/AppLayout";
import { DashboardPage } from "@/pages/client/Dashboard";
import { WorkstationsPage } from "@/pages/client/Workstation";
import { CoursesPage } from "@/pages/client/Courses";
import { CourseDetailPage } from "@/pages/client/CourseSection";
import { AtRiskPage } from "@/pages/client/AtRisk";
import { SchedulePage } from "@/pages/client/Schedule";
import { LabAssignmentsPage } from "@/pages/client/LabAssignments";
import { FlaggedSessionsPage } from "@/pages/client/FlaggedSession";
import { ConfirmSessionsPage } from "@/pages/client/ConfirmSession";
import { AttendanceReportsPage } from "@/pages/client/AttendanceReport";
import { UsersPage } from "@/pages/client/Users";
import { SettingsPage } from "@/pages/client/Settings";
import { MyAttendancePage } from "@/pages/client/MyAttendance";

import { NotFound } from "@/pages/public/NotFound";

import "./App.css";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RoleProvider>
          <BrowserRouter>
            <Routes>
              {/* Public / auth pages */}
              <Route path="/" element={<StaffLoginPage />} />
              <Route path="/student-login" element={<StudentLoginPage />} />
              <Route path="/my-attendance" element={<MyAttendancePage />} />

              {/* Staff app shell (sidebar + topbar) — requires a real logged-in session */}
              <Route
                element={
                  <RequireAuth>
                    <AppLayout />
                  </RequireAuth>
                }
              >
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/workstation" element={<WorkstationsPage />} />
                <Route path="/courses" element={<CoursesPage />} />
                <Route path="/courses/:sectionId" element={<CourseDetailPage />} />
                <Route path="/at-risk" element={<AtRiskPage />} />
                <Route path="/schedule" element={<SchedulePage />} />
                <Route path="/lab-assignments" element={<LabAssignmentsPage />} />
                <Route path="/flagged-session" element={<FlaggedSessionsPage />} />
                <Route path="/confirm-session" element={<ConfirmSessionsPage />} />
                <Route path="/attendance-report" element={<AttendanceReportsPage />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </RoleProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;