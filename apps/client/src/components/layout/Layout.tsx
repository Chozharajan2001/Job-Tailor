import { useEffect, useRef, useState } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  Kanban,
  BarChart3,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import ErrorBoundary from "../ErrorBoundary";
import { useAuthStore } from "../../stores/authStore";
import { authService } from "../../services/auth";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/profile", label: "Profile", icon: Briefcase },
  { to: "/jobs", label: "Jobs", icon: FileText },
  { to: "/tailor", label: "Tailor Resume", icon: FileText },
  { to: "/tracker", label: "Tracker", icon: Kanban },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
];

const NAV_ID = "app-nav";
const MD_BREAKPOINT = "(min-width: 768px)";

/**
 * Tailwind cannot express "inert below md, interactive above", and an
 * off-canvas drawer translated off-screen is still focusable — a keyboard user
 * would tab into a nav they cannot see. The breakpoint is therefore read here
 * so the closed drawer can be taken out of the tab order on phones only.
 */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(MD_BREAKPOINT).matches
      : true,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(MD_BREAKPOINT);
    const onChange = (event: MediaQueryListEvent) =>
      setIsDesktop(event.matches);
    setIsDesktop(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}

export default function Layout() {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [navOpen, setNavOpen] = useState(false);
  const isDesktop = useIsDesktop();
  const navHidden = !isDesktop && !navOpen;
  const navToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!navOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setNavOpen(false);
        navToggleRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navOpen]);

  // A drawer that stays open after navigation covers the page it just loaded.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  function dismissNav() {
    setNavOpen(false);
    navToggleRef.current?.focus();
  }

  async function handleLogout() {
    // Revoke the session server-side first (invalidates the HttpOnly refresh
    // cookie), then clear local state and cached data.
    try {
      await authService.logout();
    } catch {
      // Even if the server call fails, log out locally
    }
    queryClient.clear();
    clearAuth();
    navigate("/login");
  }

  const initials = user
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
    : "U";
  const fullName = user ? `${user.firstName} ${user.lastName}` : "User Profile";

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile bar — the fixed w-64 sidebar alone left the content pane 119px
          wide at 375px, so below md the nav becomes an off-canvas drawer. */}
      <div className="md:hidden fixed top-0 inset-x-0 z-50 flex items-center gap-3 h-14 px-4 bg-white border-b border-gray-200">
        <button
          ref={navToggleRef}
          type="button"
          onClick={() => setNavOpen((open) => !open)}
          aria-label={navOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={navOpen}
          aria-controls={NAV_ID}
          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors cursor-pointer"
        >
          {navOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <span className="text-base font-bold text-primary">JobTailor</span>
      </div>

      {navOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          aria-hidden="true"
          onClick={dismissNav}
        />
      )}

      {/* Sidebar */}
      <aside
        id={NAV_ID}
        inert={navHidden}
        aria-hidden={navHidden || undefined}
        className={`w-64 shrink-0 bg-white border-r border-gray-200 flex flex-col h-screen z-50 md:z-auto transition-transform motion-reduce:transition-none fixed inset-y-0 left-0 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        } md:static md:h-auto md:translate-x-0`}
      >
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-primary">JobTailor</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Smart Job Application OS
          </p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/dashboard"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-200 space-y-2">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{fullName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {user?.email || "authenticated"}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Log Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-auto pt-14 md:pt-0">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
