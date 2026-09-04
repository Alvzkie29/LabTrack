import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutGrid,
  BookOpen,
  AlertCircle,
  CalendarDays,
  Settings,
  Users,
  LogOut,
  Menu,
  X,
  Search,
  Bell,
  ChevronsLeft,
  ChevronsRight,
  Briefcase,
  CheckCircle2,  
  ShieldAlert,   
  FileSpreadsheet,
  Monitor,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useRole, type Role, canAccess } from "@/contexts/RoleContext";
import { useAuth } from "@/contexts/AuthContext";
import { getQuickAlerts, type QuickAlert } from "@/api/alerts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavItem = { to: string; label: string; icon: ReactNode };

const IC = "size-4" as const;
const MAROON = "#800000";
const GOLD = "#F4C430";

const ALL_NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: <LayoutGrid className={IC} strokeWidth={1.75} /> },
  { to: "/workstation", label: "Workstations", icon: <Monitor className={IC} strokeWidth={1.75} /> },
  { to: "/courses",   label: "Courses",   icon: <BookOpen className={IC} strokeWidth={1.75} /> },
  { to: "/confirm-session",   label: "Confirm Sessions",   icon: <CheckCircle2 className={IC} strokeWidth={1.75} /> },
  { to: "/flagged-session",   label: "Flagged Sessions",   icon: <ShieldAlert className={IC} strokeWidth={1.75} /> },
  { to: "/at-risk",   label: "At Risk",   icon: <AlertCircle className={IC} strokeWidth={1.75} /> },
  { to: "/attendance-report", label: "Attendance Reports", icon: <FileSpreadsheet className={IC} strokeWidth={1.75} /> },
  { to: "/schedule",  label: "Schedule",  icon: <CalendarDays className={IC} strokeWidth={1.75} /> },
  { to: "/lab-assignments", label: "Lab Assignments", icon: <Briefcase className={IC} strokeWidth={1.75} /> },
  { to: "/users",     label: "Users",     icon: <Users className={IC} strokeWidth={1.75} /> },
];

function navFor(role: Role): NavItem[] {
  return ALL_NAV.filter((n) => canAccess(role, n.to));
}

function initialsFor(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const ROLE_DISPLAY_LABELS: Record<Role, string> = {
  Administrator: "Administrator",
  Custodian: "Laboratory Custodian",
  LabAssistant: "Laboratory Assistant",
  Student: "Student",
};

function labelForPath(pathname: string): string {
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  if (pathname.startsWith("/workstation")) return "Workstations";
  if (pathname.startsWith("/courses")) return "Courses";
  if (pathname.startsWith("/confirm-session")) return "Confirm Sessions";
  if (pathname.startsWith("/flagged-session")) return "Flagged Sessions";
  if (pathname.startsWith("/at-risk")) return "At Risk";
  if (pathname.startsWith("/attendance-report")) return "Attendance Reports";
  if (pathname.startsWith("/schedule")) return "Schedule";
  if (pathname.startsWith("/lab-assignments")) return "Lab Assignments";
  if (pathname.startsWith("/users")) return "Users";
  if (pathname.startsWith("/settings")) return "Settings";
  return "Page";
}

function Sidebar({
  items, pathname, user, collapsed, onToggleCollapse, onNavigate, showSettings,
}: {
  items: NavItem[];
  pathname: string;
  user: { name: string; sub: string; initials: string };
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNavigate?: () => void;
  showSettings: boolean;
}) {
  const width = collapsed ? 64 : 232;
  return (
    <div
      className="flex h-full flex-col transition-[width] duration-200"
      style={{ width, background: "#ffffff", borderRight: "1px solid #d1d9e0" }}
    >
      <div
        className="flex items-center gap-2 px-3 py-3.5"
        style={{ borderBottom: "1px solid #e1e4e8", justifyContent: collapsed ? "center" : "space-between" }}
      >
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="flex size-7 items-center justify-center rounded-md"
              style={{ background: MAROON, color: GOLD, fontWeight: 800, fontSize: 12, letterSpacing: -0.5 }}
            >
              LT
            </div>
            <div className="leading-tight min-w-0">
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "#0d1117", letterSpacing: -0.2 }}>LabTrack</div>
              <div style={{ fontSize: 10, color: "#57606a", fontFamily: "var(--font-mono)" }}>UM · CCE</div>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex size-7 items-center justify-center rounded-md hover:bg-[#f6f8fa]"
          style={{ color: "#57606a" }}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
        </button>
      </div>

      <nav className="sidebar-nav-scroll flex-1 overflow-y-auto p-2">
        {!collapsed && (
          <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "#57606a", padding: "8px 10px 6px", fontWeight: 600, textTransform: "uppercase" }}>
            Menu
          </div>
        )}
        <div className="space-y-0.5">
          {items.map((item) => {
            const active = pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to + "/"));
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                title={collapsed ? item.label : undefined}
                className="group relative flex items-center gap-2.5 rounded-md transition-colors"
                style={{
                  background: active ? "#f6f8fa" : "transparent",
                  color: active ? "#0d1117" : "#57606a",
                  padding: collapsed ? "8px 0" : "6px 10px",
                  justifyContent: collapsed ? "center" : "flex-start",
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "#f6f8fa"; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                {active && (
                  <span
                    aria-hidden
                    style={{ position: "absolute", left: -2, top: 6, bottom: 6, width: 2, background: MAROON, borderRadius: 2 }}
                  />
                )}
                <span style={{ color: active ? MAROON : "#57606a", display: "inline-flex" }}>{item.icon}</span>
                {!collapsed && <span style={{ fontSize: 13, fontWeight: active ? 600 : 500 }}>{item.label}</span>}
              </Link>
            );
          })}

          {showSettings && (
            <Link
              to="/settings"
              onClick={onNavigate}
              title={collapsed ? "Settings" : undefined}
              className="mt-1 flex items-center gap-2.5 rounded-md"
              style={{
                color: pathname === "/settings" ? "#0d1117" : "#57606a",
                background: pathname === "/settings" ? "#f6f8fa" : "transparent",
                padding: collapsed ? "8px 0" : "6px 10px",
                justifyContent: collapsed ? "center" : "flex-start",
              }}
            >
              <Settings className={IC} strokeWidth={1.75} />
              {!collapsed && <span style={{ fontSize: 13 }}>Settings</span>}
            </Link>
          )}
        </div>
      </nav>

      <div
        className="flex items-center gap-2.5"
        style={{ padding: "10px 12px", borderTop: "1px solid #e1e4e8", background: "#ffffff", justifyContent: collapsed ? "center" : "flex-start" }}
      >
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full"
          style={{ background: MAROON, color: GOLD, fontSize: 11, fontWeight: 700 }}
        >
          {user.initials}
        </span>
        {!collapsed && (
          <span className="min-w-0 flex-1">
            <span className="block truncate" style={{ fontSize: 12.5, fontWeight: 600, color: "#0d1117" }}>{user.name}</span>
            <span className="block truncate" style={{ fontSize: 10.5, color: "#57606a" }}>{user.sub}</span>
          </span>
        )}
      </div>
    </div>
  );
}

export function AppShell() {
  const { role, assignedLabs } = useRole();
  const { user: authUser, logout } = useAuth();
  const navigate = useNavigate();
  const pathname = useLocation().pathname;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const items = navFor(role);
  const user = {
    name: authUser?.fullName ?? "—",
    sub: ROLE_DISPLAY_LABELS[role],
    initials: authUser ? initialsFor(authUser.fullName) : "?",
    email: authUser?.schoolId ?? "",
  };
  const pageLabel = labelForPath(pathname);

  const [alerts, setAlerts] = useState<QuickAlert[]>([]);
  useEffect(() => {
    getQuickAlerts(role).then(setAlerts);
  }, [role]);

  // Students never belong in the staff shell.
  useEffect(() => {
    if (role === "Student") {
      navigate("/student-login", { replace: true });
    }
  }, [role, navigate]);

  return (
    <div className="flex min-h-screen w-full" style={{ background: "#f6f8fa", color: "#0d1117" }}>
      <aside className="sticky top-0 hidden h-screen shrink-0 md:block">
        <Sidebar
          items={items}
          pathname={pathname}
          user={user}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          showSettings={canAccess(role, "/settings")}
        />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0">
            <Sidebar
              items={items}
              pathname={pathname}
              user={user}
              collapsed={false}
              onToggleCollapse={() => setMobileOpen(false)}
              onNavigate={() => setMobileOpen(false)}
              showSettings={canAccess(role, "/settings")}
            />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-2 top-2 rounded-md p-1.5 hover:bg-[#f6f8fa]"
              aria-label="Close menu"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 md:px-6"
          style={{ background: "#ffffff", borderBottom: "1px solid #d1d9e0", minHeight: 68 }}
        >
          <button
            onClick={() => setMobileOpen(true)}
            className="flex size-8 items-center justify-center rounded-md md:hidden"
            style={{ border: "1px solid #d1d9e0", background: "#ffffff" }}
            aria-label="Open menu"
          >
            <Menu className="size-4" />
          </button>

          <div className="min-w-0 shrink-0">
            <div className="font-mono text-[11px]" style={{ color: "#57606a" }}>
              Pages <span style={{ margin: "0 4px" }}>/</span>
              <span style={{ color: MAROON }}>{pageLabel}</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0d1117", letterSpacing: -0.2, lineHeight: 1.2 }}>
              {pageLabel}
            </div>
          </div>

          <div
            className="ml-6 hidden flex-1 items-center gap-2 px-3.5 py-2 lg:flex max-w-md"
            style={{ background: "#ffffff", border: "1px solid #d1d9e0", borderRadius: 999 }}
          >
            <Search className="size-3.5" style={{ color: "#57606a" }} />
            <input
              placeholder="Type here…"
              className="w-full bg-transparent text-[13px] outline-none"
              style={{ color: "#0d1117" }}
            />
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            {/* Assigned lab badges (Lab Assistant only) */}
            {role === "LabAssistant" && assignedLabs.length > 0 && (
              <div className="hidden sm:flex items-center gap-1.5">
                <span className="font-mono text-[10.5px] uppercase tracking-wider" style={{ color: "#57606a" }}>
                  Assigned Lab{assignedLabs.length > 1 ? "s" : ""}:
                </span>
                {assignedLabs.map((lab) => (
                  <span
                    key={lab}
                    className="font-mono text-[11px]"
                    style={{
                      background: "#fff4f4",
                      border: "1px solid #f1d7d7",
                      color: MAROON,
                      padding: "2px 8px",
                      borderRadius: 999,
                      fontWeight: 600,
                    }}
                  >
                    {lab}
                  </span>
                ))}
              </div>
            )}

            {/* Role badge (read-only chip; no switching from header) */}
            <span
              className="hidden sm:inline-flex items-center gap-1.5 font-mono text-[11px]"
              style={{
                background: "#f6f8fa",
                border: "1px solid #d1d9e0",
                color: "#0d1117",
                padding: "4px 10px",
                borderRadius: 999,
              }}
            >
              <span style={{ color: "#57606a" }}>Role ·</span>
              <span style={{ fontWeight: 600 }}>{role}</span>
            </span>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="relative flex size-9 items-center justify-center rounded-full hover:bg-[#f6f8fa]"
                  aria-label="Notifications"
                  style={{ color: "#57606a" }}
                >
                  <Bell className="size-4" />
                  {alerts.length > 0 && (
                    <span
                      aria-hidden
                      className="absolute"
                      style={{ top: 8, right: 9, width: 6, height: 6, background: MAROON, borderRadius: 999, border: "1.5px solid #ffffff" }}
                    />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Quick Info & Alerts</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {alerts.length === 0 && (
                  <div className="px-2 py-3 text-center text-[12.5px]" style={{ color: "#57606a" }}>
                    Nothing needs your attention right now.
                  </div>
                )}
                {alerts.map((a) => (
                  <DropdownMenuItem key={a.id} onClick={() => navigate(a.href)} className="items-start gap-2 py-2">
                    <span
                      className="mt-0.5 inline-block size-1.5 shrink-0 rounded-full"
                      style={{ background: a.tone === "warning" ? MAROON : "#57606a" }}
                    />
                    <span className="text-[12.5px] leading-snug">{a.message}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 hover:bg-[#f6f8fa]"
                  style={{ border: "1px solid transparent" }}
                >
                  <span
                    className="flex size-8 items-center justify-center rounded-full"
                    style={{ background: MAROON, color: GOLD, fontSize: 11, fontWeight: 800 }}
                  >
                    {user.initials}
                  </span>
                  <span className="hidden text-left leading-tight sm:block">
                    <span className="block" style={{ fontSize: 12.5, fontWeight: 700, color: "#0d1117" }}>{user.name}</span>
                    <span className="block truncate" style={{ fontSize: 10.5, color: "#57606a", maxWidth: 180 }}>{user.email}</span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{user.name}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {canAccess(role, "/settings") && (
                  <DropdownMenuItem onClick={() => navigate("/settings")}>
                    <Settings className="mr-2 size-3.5" /> Settings
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => { logout(); navigate("/"); }}>
                  <LogOut className="mr-2 size-3.5" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}