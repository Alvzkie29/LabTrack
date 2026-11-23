import { OnlineStaff } from "@/components/OnlineStaff";
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
  CheckCircle2,
  CalendarCheck,
  ShieldAlert,   
  FileSpreadsheet,
  Monitor,
  Upload,
  CalendarRange,
  CalendarClock,
  Mail,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactElement, type ReactNode, type RefObject } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useRole, type Role, canAccess } from "@/contexts/RoleContext";
import { useAuth } from "@/contexts/AuthContext";
import { getQuickAlerts, type QuickAlert } from "@/api/alerts";
import { getAcademicYears, semesterName, type AcademicYear } from "@/api/academicYears";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import "./app-sidebar.css";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavItem = { to: string; label: string; icon: ReactNode };
type NavGroup = { id: string; label: string; items: NavItem[] };
type SidebarUser = { name: string; sub: string; initials: string };
const SIDEBAR_PREF_KEY = "labtrack.sidebarExpanded";

function savedSidebarExpanded() {
  try { return localStorage.getItem(SIDEBAR_PREF_KEY) === "true"; }
  catch { return false; }
}

const IC = "size-4" as const;

const NAV_GROUPS: NavGroup[] = [
  { id: "workspace", label: "Workspace", items: [
    { to: "/dashboard", label: "Dashboard", icon: <LayoutGrid className={IC} strokeWidth={1.75} /> },
    { to: "/workstation", label: "Workstations", icon: <Monitor className={IC} strokeWidth={1.75} /> },
    { to: "/courses",   label: "Courses",   icon: <BookOpen className={IC} strokeWidth={1.75} /> },
  ] },
  { id: "operations", label: "Class operations", items: [
    { to: "/schedule",  label: "Schedule",  icon: <CalendarDays className={IC} strokeWidth={1.75} /> },
    { to: "/make-up-classes", label: "Make-up Classes", icon: <CalendarClock className={IC} strokeWidth={1.75} /> },
    { to: "/confirm-session",   label: "Confirm Sessions",   icon: <CheckCircle2 className={IC} strokeWidth={1.75} /> },
    { to: "/class-status",      label: "Class Status",       icon: <CalendarCheck className={IC} strokeWidth={1.75} /> },
  ] },
  { id: "reports", label: "Monitoring & reports", items: [
    { to: "/attendance-report", label: "Attendance Reports", icon: <FileSpreadsheet className={IC} strokeWidth={1.75} /> },
    { to: "/weekly-report",     label: "Weekly Report",      icon: <FileSpreadsheet className={IC} strokeWidth={1.75} /> },
    { to: "/compliance-report", label: "Compliance Report", icon: <FileSpreadsheet className={IC} strokeWidth={1.75} /> },
    { to: "/at-risk",   label: "At Risk",   icon: <AlertCircle className={IC} strokeWidth={1.75} /> },
  ] },
  { id: "administration", label: "Administration", items: [
    { to: "/academic-years", label: "Academic Years", icon: <CalendarRange className={IC} strokeWidth={1.75} /> },
    { to: "/imports",           label: "Import",             icon: <Upload className={IC} strokeWidth={1.75} /> },
    { to: "/email-reminders", label: "Email Reminders", icon: <Mail className={IC} strokeWidth={1.75} /> },
    { to: "/audit-log",         label: "Audit Log",          icon: <ShieldAlert className={IC} strokeWidth={1.75} /> },
    { to: "/users",     label: "Users",     icon: <Users className={IC} strokeWidth={1.75} /> },
    { to: "/settings", label: "Settings", icon: <Settings className={IC} strokeWidth={1.75} /> },
  ] },
];

function navFor(role: Role): NavGroup[] {
  return NAV_GROUPS.map(group => ({ ...group, items: group.items.filter(item => canAccess(role, item.to)) }))
    .filter(group => group.items.length > 0);
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
  Faculty: "Faculty",
  Student: "Student",
};

function Navigation({ groups, pathname, user, onNavigate, onClose }: {
  groups: NavGroup[];
  pathname: string;
  user: SidebarUser;
  onNavigate: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f6f5f1] text-[#403b39]">
      <div className="flex shrink-0 items-center justify-between px-5 py-4">
        <span className="text-sm font-semibold">Navigation</span>
        <button type="button" onClick={onClose} aria-label="Close navigation menu"
          className="flex size-8 items-center justify-center rounded-full text-[#8b827d] hover:bg-[#e9e4df] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#800000]">
          <X className="size-4" />
        </button>
      </div>
      <nav aria-label="Workspace navigation" className="sidebar-nav-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {groups.map((group, index) => <section key={group.id} aria-labelledby={`nav-heading-${group.id}`}
          className={index ? "mt-3 border-t border-[#e5ded6] pt-3" : ""}>
          <h3 id={`nav-heading-${group.id}`} className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7c6b61]">{group.label}</h3>
          {group.items.map((item) => {
            const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
            return <Link key={item.to} to={item.to} onClick={onNavigate} aria-current={active ? "page" : undefined}
              className={`flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-[13px] transition focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#800000] ${active ? "bg-[#800000] font-semibold text-[#F4C430]" : "text-[#716863] hover:bg-[#eae5df]"}`}>
              {item.icon}{item.label}
            </Link>;
          })}
        </section>)}
      </nav>
      <div className="flex shrink-0 items-center gap-3 border-t border-[#e5ded6] px-5 py-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#800000] text-xs font-bold text-[#F4C430]">{user.initials}</span>
        <span className="min-w-0"><span className="block truncate text-[13px] font-semibold">{user.name}</span><span className="mt-0.5 block truncate text-[11px] text-[#8c8078]">{user.sub}</span></span>
      </div>
    </div>
  );
}

function SidebarTooltip({ label, expanded, children }: { label: string; expanded: boolean; children: ReactElement }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (expanded) setOpen(false); }, [expanded]);
  return <Tooltip open={!expanded && open} onOpenChange={next => setOpen(!expanded && next)}>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent side="right" sideOffset={12} className="app-sidebar-tooltip">{label}</TooltipContent>
  </Tooltip>;
}

const LOGO_SRC = "/img/logo.png";

function BrandMark() {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`app-sidebar-brand-mark ${failed ? "" : "has-logo"}`} aria-hidden="true">
      {failed ? "LT" : <img src={LOGO_SRC} alt="" onError={() => setFailed(true)} />}
    </span>
  );
}
function DesktopSidebar({ groups, pathname, user, expanded, toggleRef, onToggle, onLogout }: {
  groups: NavGroup[];
  pathname: string;
  user: SidebarUser;
  expanded: boolean;
  toggleRef: RefObject<HTMLButtonElement | null>;
  onToggle: () => void;
  onLogout: () => void;
}) {
  return <TooltipProvider delayDuration={250}>
    <aside className="app-sidebar" data-expanded={expanded} aria-label="Workspace sidebar">
      <div className="app-sidebar-brand" aria-label="LabTrack">
        <BrandMark />
        <span className="app-sidebar-brand-copy"><strong>LabTrack</strong></span>
      </div>
      <button ref={toggleRef} type="button" className="app-sidebar-toggle" onClick={onToggle}
        aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"} aria-expanded={expanded}
        aria-controls="desktop-workspace-navigation">
        <ChevronRight size={16} aria-hidden="true" />
      </button>

      <nav id="desktop-workspace-navigation" aria-label="Workspace pages" className="app-sidebar-nav sidebar-nav-scroll">
        {groups.map(group => <section key={group.id} className="app-sidebar-group" aria-labelledby={`desktop-nav-${group.id}`}>
          <h2 id={`desktop-nav-${group.id}`} className="app-sidebar-group-heading">{group.label}</h2>
          {group.items.map(item => {
            const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
            return <SidebarTooltip key={item.to} label={item.label} expanded={expanded}>
                <Link to={item.to} aria-label={item.label} aria-current={active ? "page" : undefined}
                  className={`app-sidebar-link ${active ? "is-active" : ""}`}>
                  <span className="app-sidebar-nav-icon" aria-hidden="true">{item.icon}</span>
                  <span className="app-sidebar-link-label">{item.label}</span>
                </Link>
            </SidebarTooltip>;
          })}
        </section>)}
      </nav>

      <div className="app-sidebar-footer">
        <div className="app-sidebar-profile" role="group" aria-label={`${user.name}, ${user.sub}`} title={`${user.name} · ${user.sub}`}>
          <span className="app-sidebar-avatar" aria-hidden="true">{user.initials}</span>
          <span className="app-sidebar-profile-copy"><strong>{user.name}</strong><small>{user.sub}</small></span>
        </div>
        <SidebarTooltip label="Sign out" expanded={expanded}>
            <button type="button" className="app-sidebar-signout" aria-label="Sign out" onClick={onLogout}>
              <LogOut size={18} aria-hidden="true" /><span className="app-sidebar-link-label">Sign out</span>
            </button>
        </SidebarTooltip>
      </div>
    </aside>
  </TooltipProvider>;
}

export function AppShell() {
  const { role } = useRole();
  const { user: authUser, logout } = useAuth();
  const navigate = useNavigate();
  const pathname = useLocation().pathname;
  const isDashboard = pathname === "/dashboard";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(savedSidebarExpanded);
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchIndex, setSearchIndex] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const groups = navFor(role);
  const items = groups.flatMap(group => group.items);
  const searchItems = items
    .filter((item) => item.label.toLowerCase().includes(search.trim().toLowerCase()))
    .slice(0, 6);
  const user = {
    name: authUser?.fullName ?? "—",
    sub: ROLE_DISPLAY_LABELS[role],
    initials: authUser ? initialsFor(authUser.fullName) : "?",
    email: authUser?.email ?? "",
    schoolId: authUser?.schoolId ?? "",
  };

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_PREF_KEY, String(sidebarExpanded)); }
    catch { /* The sidebar still works when browser storage is unavailable. */ }
  }, [sidebarExpanded]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const updateLayout = () => {
      setIsDesktop(desktop.matches);
      if (desktop.matches) setMobileOpen(false);
    };
    desktop.addEventListener("change", updateLayout);
    updateLayout();
    return () => desktop.removeEventListener("change", updateLayout);
  }, []);

  const [activeSemester, setActiveSemester] = useState<AcademicYear | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    getAcademicYears()
      .then((years) => { if (!cancelled) setActiveSemester(years.find((year) => year.isActive) ?? null); })
      .catch(() => { if (!cancelled) setActiveSemester(undefined); });
    return () => { cancelled = true; };
  }, [pathname]);
  const today = new Date().toLocaleDateString("en-CA");
  const termNow = !activeSemester || activeSemester.termType === "Summer" ? null
    : activeSemester.secondTermStart && today >= activeSemester.secondTermStart.slice(0, 10) ? "2nd Term" : "1st Term";
  const [alerts, setAlerts] = useState<QuickAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsError, setAlertsError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setAlertsLoading(true);
    setAlertsError(false);
    getQuickAlerts(role)
      .then((nextAlerts) => { if (!cancelled) setAlerts(nextAlerts.filter((alert) => canAccess(role, alert.href))); })
      .catch(() => { if (!cancelled) setAlertsError(true); })
      .finally(() => { if (!cancelled) setAlertsLoading(false); });
    return () => { cancelled = true; };
  }, [role, notificationsOpen]);

  useEffect(() => {
    if (role === "Student") navigate("/", { replace: true });
  }, [role, navigate]);

  function openSearchResult(path: string) {
    setSearchOpen(false);
    setSearch("");
    navigate(path);
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden" style={{ background: "#e9e8e3", color: "#24282a" }}>
      <DesktopSidebar groups={groups} pathname={pathname} user={user} expanded={sidebarExpanded} toggleRef={sidebarToggleRef}
        onToggle={() => setSidebarExpanded(value => !value)} onLogout={() => { logout(); navigate("/"); }} />

      {!isDesktop && <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[264px] p-0 [&>button]:hidden"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (window.matchMedia("(min-width: 768px)").matches ? sidebarToggleRef : menuButtonRef).current?.focus();
          }}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Choose a laboratory management page.</SheetDescription>
          <Navigation groups={groups} pathname={pathname} user={user} onClose={() => setMobileOpen(false)}
            onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>}

      <div className="app-content flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="relative z-30 flex h-[72px] shrink-0 items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6" style={{ background: "#e9e8e3" }}>
          <button ref={menuButtonRef} type="button" onClick={() => setMobileOpen(true)}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/50 text-[#68625d] transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#800000] md:hidden"
            aria-label="Open navigation menu">
            <Menu className="size-[18px]" strokeWidth={1.7} />
          </button>
          <form role="search" className="relative min-w-0 max-w-[440px] flex-1"
            onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false); }}
            onSubmit={(event) => { event.preventDefault(); if (searchItems[searchIndex]) openSearchResult(searchItems[searchIndex].to); }}>
            <div className="flex h-[48px] items-center gap-2.5 rounded-2xl border border-white bg-[#f8f9f5] px-3.5 shadow-[0_2px_6px_rgba(48,51,41,0.025)] sm:px-4">
              <Search className="size-4 shrink-0 text-[#858a80]" strokeWidth={1.7} />
              <input value={search} onChange={(event) => { setSearch(event.target.value); setSearchIndex(0); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setSearchOpen(false);
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    setSearchOpen(true);
                    setSearchIndex((value) => Math.max(0, Math.min(searchItems.length - 1, value + (event.key === "ArrowDown" ? 1 : -1))));
                  }
                }}
                role="combobox" aria-label="Search LabTrack pages" aria-expanded={searchOpen} aria-controls="labtrack-search-results"
                aria-autocomplete="list" aria-activedescendant={searchOpen && searchItems[searchIndex] ? `labtrack-search-${searchIndex}` : undefined}
                placeholder="Search pages, reports, workstations…"
                className="w-full min-w-0 bg-transparent text-[13px] text-[#353b32] outline-none placeholder:text-[#93988d]" />
              <kbd aria-hidden="true" className="hidden rounded-md border border-[#e4e7de] bg-white px-1.5 py-0.5 text-[10px] text-[#9ba18e] sm:block">↵</kbd>
            </div>
            {searchOpen && (
              <div id="labtrack-search-results" role="listbox" aria-label="Pages" className="absolute left-0 right-0 top-[56px] overflow-hidden rounded-2xl border border-[#e1e4db] bg-white p-1.5 shadow-xl">
                <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#8b9084]">{search.trim() ? "Matching pages" : "Go to a page"}</p>
                {searchItems.length ? searchItems.map((item, index) => (
                  <button id={`labtrack-search-${index}`} key={item.to} type="button" role="option" tabIndex={-1} aria-selected={index === searchIndex}
                    onMouseEnter={() => setSearchIndex(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => openSearchResult(item.to)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] ${index === searchIndex ? "bg-[#f5eeeb] text-[#800000]" : "text-[#5d6458] hover:bg-[#f6f7f3]"}`}>
                    {item.icon}{item.label}
                  </button>
                )) : <p className="px-3 py-4 text-[13px] text-[#777d70]">No matching pages.</p>}
              </div>
            )}
          </form>

          <div className="ml-auto flex shrink-0 items-center gap-2 pl-1 sm:gap-3 sm:pl-3">
            <OnlineStaff />
            <DropdownMenu open={notificationsOpen} onOpenChange={setNotificationsOpen}>
              <DropdownMenuTrigger asChild>
                <button type="button" className="relative flex size-10 items-center justify-center rounded-xl border border-white/80 bg-white/55 text-[#70776a] transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#800000]"
                  aria-label={`Notifications${alerts.length ? `, ${alerts.length} alerts` : ""}`}>
                  <Bell className="size-[18px]" strokeWidth={1.6} />
                  {alerts.length > 0 && <span aria-hidden="true" className="absolute right-2 top-2 size-1.5 rounded-full bg-[#800000] ring-2 ring-[#f6f7f2]" />}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[min(340px,calc(100vw-24px))] rounded-2xl border-[#e0e4d9] p-2 shadow-xl">
                <DropdownMenuLabel className="flex items-center justify-between px-2 py-2 text-sm">Notifications<span className="rounded-md bg-[#f3eee8] px-1.5 py-0.5 text-[10px] text-[#800000]">{alerts.length}</span></DropdownMenuLabel>
                <p className="px-2 pb-2 text-xs text-[#828878]">Course compliance and assignment alerts</p>
                <DropdownMenuSeparator />
                {alertsLoading ? <p role="status" className="px-2 py-5 text-center text-[13px] text-[#727969]">Checking alerts…</p>
                  : alertsError ? <p role="status" className="px-2 py-5 text-center text-[13px] text-[#800000]">Unable to load alerts. Reopen to try again.</p>
                  : alerts.length === 0 ? <p className="px-2 py-5 text-center text-[13px] text-[#727969]">You're all caught up.</p>
                  : alerts.map((alert) => (
                    <DropdownMenuItem key={alert.id} onClick={() => navigate(alert.href)} className="items-start gap-2.5 rounded-xl px-2 py-3">
                      <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${alert.tone === "warning" ? "bg-[#fff0e7] text-[#800000]" : "bg-[#f0f2ea] text-[#69745b]"}`}><AlertCircle className="size-3.5" /></span>
                      <span className="pt-0.5 text-[13px] leading-snug">{alert.message}</span>
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={`Account menu for ${user.name}`} className="flex h-[48px] items-center gap-2.5 rounded-2xl border border-white bg-[#f8f9f5] py-1.5 pl-1.5 pr-1.5 transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#800000] sm:pr-3">
                  <span className="flex size-[34px] shrink-0 items-center justify-center rounded-xl bg-[#800000] text-[11px] font-bold text-[#F4C430]">{user.initials}</span>
                  <span className="hidden min-w-0 text-left leading-tight sm:block">
                    <span className="block max-w-[130px] truncate text-[12px] font-semibold text-[#33392e]">{user.name}</span>
                    <span className="mt-0.5 block max-w-[130px] truncate text-[10px] text-[#8a9080]">{user.sub}</span>
                  </span>
                  <ChevronDown aria-hidden="true" className="ml-1 hidden size-3.5 text-[#89917f] sm:block" strokeWidth={1.6} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[min(320px,calc(100vw-24px))] rounded-2xl border-[#e0e4d9] p-2 shadow-xl">
                <DropdownMenuLabel className="px-3 py-3 font-normal">
                  <span className="mb-3 block text-[10px] font-semibold uppercase tracking-wider text-[#828878]">Signed in as</span>
                  <span className="flex items-center gap-3">
                    <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#800000] text-sm font-bold text-[#F4C430]">{user.initials}</span>
                    <span className="min-w-0">
                      <span className="block break-words text-sm font-semibold text-[#33392e]">{user.name}</span>
                      <span className="mt-1 block text-xs text-[#828878]">{ROLE_DISPLAY_LABELS[authUser?.role ?? role]}</span>
                    </span>
                  </span>
                </DropdownMenuLabel>
                <dl className="space-y-2 px-3 pb-3 text-xs">
                  <div>
                    <dt className="text-[#828878]">Email</dt>
                    <dd className="mt-0.5 break-words text-[#33392e]">{user.email || "Not provided"}</dd>
                  </div>
                  <div>
                    <dt className="text-[#828878]">School ID</dt>
                    <dd className="mt-0.5 break-words text-[#33392e]">{user.schoolId || "Not provided"}</dd>
                  </div>
                </dl>
                {activeSemester !== undefined && <p className="px-2 pb-2 text-[11px] leading-relaxed text-[#800000]">{activeSemester ? `${semesterName(activeSemester)}${termNow ? ` · ${termNow}` : ""}` : "No active semester"}</p>}
                <DropdownMenuSeparator />
                {canAccess(role, "/settings") && <DropdownMenuItem className="rounded-xl py-2" onClick={() => navigate("/settings")}><Settings className="mr-2 size-3.5" />Account settings</DropdownMenuItem>}
                <DropdownMenuItem className="rounded-xl py-2" onClick={() => { logout(); navigate("/"); }}><LogOut className="mr-2 size-3.5" />Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

       
<main
  className={
    isDashboard
      ? "relative min-h-0 min-w-0 flex-1 overflow-hidden"
      : "min-h-0 min-w-0 flex-1 overflow-y-auto"
  }
>
  <div
    className={
      isDashboard
        ? "h-full min-h-0 w-full"
        : "mx-auto w-full min-w-0 max-w-[1680px] px-5 py-6 md:px-7 lg:px-10 xl:px-12"
    }
  >
    <Outlet />
  </div>
</main>

      </div>
    </div>
  );
}
