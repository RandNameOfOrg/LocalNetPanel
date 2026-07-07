import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Monitor, Terminal, Clock, BookOpen, Globe, Puzzle, Users, LogOut, Menu, X } from 'lucide-react';
import { useAuthStore } from '../store/auth';
import { can } from '../lib/permissions';
import { api } from '../api/client';

const allNavItems = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true, perm: null as string | null },
  { to: '/devices', label: 'Devices', icon: Monitor, end: false, perm: null as string | null },
  { to: '/commands', label: 'Commands', icon: BookOpen, end: false, perm: 'commands' },
  { to: '/cron', label: 'Cron Jobs', icon: Clock, end: false, perm: 'cron' },
  { to: '/domains', label: 'Domains', icon: Globe, end: false, perm: 'domains' },
  { to: '/integrations', label: 'Integrations', icon: Puzzle, end: false, perm: 'manage_domains' },
  { to: '/users', label: 'Users', icon: Users, end: false, perm: 'manage_users' },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navItems = allNavItems.filter(item => !item.perm || can(user, item.perm));

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    logout();
    navigate('/login');
  };

  const sidebar = (onClose?: () => void) => (
    <>
      <div className="px-4 py-5 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal size={20} className="text-blue-400" />
          <span className="font-semibold text-white">Network Panel</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-gray-500 hover:text-white md:hidden" aria-label="Close menu">
            <X size={18} />
          </button>
        )}
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-gray-800">
        <div className="text-xs text-gray-500 mb-2">{user?.username} · {user?.role}</div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <LogOut size={14} />
          Logout
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-gray-950">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex-col">
        {sidebar()}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
            {sidebar(() => setMobileOpen(false))}
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800">
          <button onClick={() => setMobileOpen(true)} className="text-gray-300 hover:text-white" aria-label="Open menu">
            <Menu size={20} />
          </button>
          <Terminal size={18} className="text-blue-400" />
          <span className="font-semibold text-white">Network Panel</span>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
