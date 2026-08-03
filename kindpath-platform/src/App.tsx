import type { ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/features/auth/AuthContext';
import { ProtectedRoute, RoleGuard } from '@/features/auth/ProtectedRoute';
import { LoginPage } from '@/features/auth/LoginPage';
import { AppLayout } from '@/components/layout/AppLayout';
import { DashboardPage } from '@/routes/DashboardPage';
import { ClientsListPage } from '@/features/clients/ClientsListPage';
import { ClientFormPage } from '@/features/clients/ClientFormPage';
import { ClientDetailPage } from '@/features/clients/ClientDetailPage';
import { PeopleListPage } from '@/features/people/PeopleListPage';
import { PersonDetailPage } from '@/features/people/PersonDetailPage';
import { IncidentsPage } from '@/features/incidents/IncidentsPage';
import { RiskRegisterPage } from '@/features/risk-register/RiskRegisterPage';
import { CoordinatedSummaryPage } from '@/features/share/CoordinatedSummaryPage';

function Protected({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/share/:token" element={<CoordinatedSummaryPage />} />

          <Route
            path="/"
            element={
              <Protected>
                <DashboardPage />
              </Protected>
            }
          />
          <Route
            path="/clients"
            element={
              <Protected>
                <ClientsListPage />
              </Protected>
            }
          />
          <Route
            path="/clients/new"
            element={
              <Protected>
                <ClientFormPage />
              </Protected>
            }
          />
          <Route
            path="/clients/:id"
            element={
              <Protected>
                <ClientDetailPage />
              </Protected>
            }
          />
          <Route
            path="/clients/:id/edit"
            element={
              <Protected>
                <ClientFormPage />
              </Protected>
            }
          />
          <Route
            path="/people"
            element={
              <Protected>
                <PeopleListPage />
              </Protected>
            }
          />
          <Route
            path="/people/:id"
            element={
              <Protected>
                <PersonDetailPage />
              </Protected>
            }
          />
          <Route
            path="/incidents"
            element={
              <Protected>
                <IncidentsPage />
              </Protected>
            }
          />
          <Route
            path="/risk-register"
            element={
              <Protected>
                <RoleGuard allow={['admin', 'care_advocacy', 'committee']}>
                  <RiskRegisterPage />
                </RoleGuard>
              </Protected>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
