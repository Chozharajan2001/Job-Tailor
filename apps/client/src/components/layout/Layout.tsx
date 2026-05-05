import { Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, UserBriefcase, FileText, Kanban, BarChart3, Settings } from 'lucide-react';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/profile', label: 'Profile', icon: UserBriefcase },
  { to: '/jobs', label: 'Jobs', icon: FileText },
  { to: '/tailor', label: 'Tailor Resume', icon: FileText },
  { to: '/tracker', label: 'Tracker', icon: Kanban },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
];

export default function Layout() {
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-primary">JobTailor</h1>
          <p className="text-xs text-muted-foreground mt-1">Smart Job Application OS</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/dashboard'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
              CM
            </div>
            <div>
              <p className="text-sm font-medium">Chozharajan M</p>
              <p className="text-xs text-muted-foreground">Full Stack Dev</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
