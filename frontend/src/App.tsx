import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import { can } from './lib/permissions';
import Layout from './components/Layout';
import Login from './pages/Login';
import Setup from './pages/Setup';
import Overview from './pages/Overview';
import Dashboard from './pages/Dashboard';
import DevicePage from './pages/DevicePage';
import TerminalPage from './pages/TerminalPage';
import CommandsPage from './pages/CommandsPage';
import CronPage from './pages/CronPage';
import DomainsPage from './pages/DomainsPage';
import IntegrationsPage from './pages/IntegrationsPage';
import UsersPage from './pages/UsersPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.accessToken);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

function RequirePermission({ perm, children }: { perm: string; children: React.ReactNode }) {
  const user = useAuthStore(s => s.user);
  return can(user, perm) ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/setup" element={<Setup />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Overview />} />
          <Route path="devices" element={<Dashboard />} />
          <Route path="devices/:id" element={<DevicePage />} />
          <Route path="devices/:id/terminal" element={<TerminalPage />} />
          <Route path="commands" element={<CommandsPage />} />
          <Route path="cron" element={<CronPage />} />
          <Route
            path="domains"
            element={
              <RequirePermission perm="domains">
                <DomainsPage />
              </RequirePermission>
            }
          />
          <Route
            path="integrations"
            element={
              <RequirePermission perm="manage_domains">
                <IntegrationsPage />
              </RequirePermission>
            }
          />
          <Route
            path="users"
            element={
              <RequirePermission perm="manage_users">
                <UsersPage />
              </RequirePermission>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
