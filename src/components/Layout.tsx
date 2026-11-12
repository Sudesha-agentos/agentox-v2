import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  BookOpen,
  Bot,
  ChevronsUpDown,
  CircleDollarSign,
  Gauge,
  Info,
  LogOut,
  Menu as MenuIcon,
  Moon,
  Plug,
  Plus,
  Radio,
  Search,
  Settings,
  ShieldCheck,
  SquareCheck,
  SquareTerminal,
  Sun,
  Users,
} from "lucide-react";
import { useApprovals, useCompanies, useLiveRuns } from "@/api/hooks";
import { useAccessRequests } from "@/api/gateway";
import { TerminalModal } from "./TerminalModal";
import { useAuth } from "@/lib/auth";
import { productHref } from "@/lib/hosts";
import { useCompany } from "@/lib/company";
import { CrumbsProvider, useCrumbState } from "@/lib/crumbs";
import { Avatar, Button, IconButton, Kbd, Mark, Menu, Spinner, cx } from "./ui";
import { CommandPalette } from "./CommandPalette";
import { NewIssueModal } from "./NewIssueModal";
import { CreateCompanyModal } from "./CreateCompanyModal";

export function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? "dark");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("agentox.theme", theme);
    } catch {
      // theme not remembered
    }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))] as const;
}

function NavItem({ to, icon, label, count, end, live }: { to: string; icon: ReactNode; label: string; count?: number; end?: boolean; live?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cx(
          "group flex h-7 items-center gap-2.5 rounded-sm px-2 text-sm transition-colors [&>svg]:size-[15px] [&>svg]:shrink-0",
          isActive
            ? "relative bg-active text-fg before:absolute before:top-1.5 before:left-0 before:h-4 before:w-[2px] before:rounded-r-full before:bg-fg [&>svg]:text-fg"
            : "text-fg-2 hover:bg-hover hover:text-fg [&>svg]:text-fg-3",
        )
      }
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {live && <span className="blink size-1.5 rounded-full bg-fg" />}
      {!!count && <span className="mono text-xs text-fg-3 tnum">{count}</span>}
    </NavLink>
  );
}

function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-px">
      <div className="mono px-2 pt-4 pb-1.5 text-2xs tracking-wider text-fg-4 uppercase">{label}</div>
      {children}
    </div>
  );
}

function WorkspaceSwitcher({ onCreate }: { onCreate: () => void }) {
  const company = useCompany();
  const { data: companies = [] } = useCompanies();
  const navigate = useNavigate();
  return (
    <Menu
      width={232}
      trigger={(p) => (
        <button {...p} className="flex h-9 w-full items-center gap-2.5 rounded-sm px-2 text-left hover:bg-hover">
          <Avatar name={company.name} size={20} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{company.name}</span>
          <ChevronsUpDown className="size-3.5 text-fg-4" />
        </button>
      )}
      items={[
        ...companies.map((c) => ({ label: c.name, icon: <Avatar name={c.name} size={16} />, checked: c.id === company.id, onSelect: () => navigate(`/${c.id}`) })),
        "separator" as const,
        { label: "New workspace", icon: <Plus />, onSelect: onCreate },
      ]}
    />
  );
}

function UserMenu() {
  const auth = useAuth();
  const [theme, toggleTheme] = useTheme();
  const navigate = useNavigate();
  const company = useCompany();
  const name = auth.user?.name || auth.user?.email || (auth.mode === "local_trusted" ? "Local operator" : "Operator");
  const sub = auth.mode === "local_trusted" ? "Trusted local instance" : auth.user?.email;
  const [terminal, setTerminal] = useState(false);
  return (
    <>
    <Menu
      width={232}
      trigger={(p) => (
        <button {...p} className="flex h-10 w-full items-center gap-2.5 rounded-sm px-2 text-left hover:bg-hover">
          <Avatar name={name} size={24} human />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{name}</span>
            <span className="block truncate text-xs text-fg-3">{sub}</span>
          </span>
          <ChevronsUpDown className="size-3.5 text-fg-4" />
        </button>
      )}
      items={[
        { label: "Account", icon: <Settings />, onSelect: () => navigate(`/${company.id}/settings`) },
        ...(auth.mode === "authenticated" ? [{ label: "Run in terminal", icon: <SquareTerminal />, onSelect: () => setTerminal(true) }] : []),
        { label: theme === "dark" ? "Light theme" : "Dark theme", icon: theme === "dark" ? <Sun /> : <Moon />, onSelect: toggleTheme },
        { label: "About agentox", icon: <Info />, onSelect: () => (productHref().startsWith("http") ? (window.location.href = productHref()) : navigate(productHref())) },
        { label: "Design system", icon: <BookOpen />, onSelect: () => navigate("/design") },
        ...(auth.canSignOut ? ["separator" as const, { label: "Sign out", icon: <LogOut />, destructive: true, onSelect: () => auth.signOut() }] : []),
      ]}
    />
    <TerminalModal open={terminal} onClose={() => setTerminal(false)} />
    </>
  );
}

function TopBar({ onMenu, onNew, onSearch }: { onMenu: () => void; onNew: () => void; onSearch: () => void }) {
  const crumbs = useCrumbState();
  const company = useCompany();
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3 sm:px-4">
      <span className="contents lg:hidden">
        <IconButton label="Open navigation" onClick={onMenu}>
          <MenuIcon />
        </IconButton>
      </span>
      <nav className="flex min-w-0 flex-1 items-center gap-1.5 text-sm" aria-label="Breadcrumb">
        <Link to={`/${company.id}`} className="hidden truncate text-fg-3 hover:text-fg sm:block">
          {company.name}
        </Link>
        {crumbs.map((c, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1.5">
            <span className="hidden text-fg-4 sm:inline">/</span>
            {c.to && i < crumbs.length - 1 ? (
              <Link to={c.to} className="truncate text-fg-3 hover:text-fg">
                {c.label}
              </Link>
            ) : (
              <span className="truncate text-fg">{c.label}</span>
            )}
          </span>
        ))}
      </nav>
      <button onClick={onSearch} className="hidden h-7 w-56 items-center gap-2 rounded-sm border border-line-2 px-2 text-sm text-fg-4 hover:border-line-3 hover:text-fg-3 md:flex">
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Search</span>
        <Kbd>⌘K</Kbd>
      </button>
      <span className="contents md:hidden">
        <IconButton label="Search" onClick={onSearch}>
          <Search />
        </IconButton>
      </span>
      <span className="hidden sm:contents">
        <Button variant="primary" size="sm" icon={<Plus />} onClick={onNew} kbd="C">
          New task
        </Button>
      </span>
      <span className="contents sm:hidden">
        <IconButton label="New task" onClick={onNew}>
          <Plus />
        </IconButton>
      </span>
    </header>
  );
}

function Shell() {
  const company = useCompany();
  const auth = useAuth();
  const cid = company.id;
  const { data: pending = [] } = useApprovals(cid, "pending");
  const { data: liveRuns = [] } = useLiveRuns(cid);
  const { data: accessRequests = [] } = useAccessRequests(cid);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newIssueOpen, setNewIssueOpen] = useState(false);
  const [newCompanyOpen, setNewCompanyOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();

  useEffect(() => setDrawer(false), [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === "c" && !document.querySelector("[role=dialog]")) {
        e.preventDefault();
        setNewIssueOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const base = `/${cid}`;
  const sidebar = (
    <div className="flex h-full flex-col px-2 py-2.5">
      <Link to={base} className="mb-2 flex h-7 items-center gap-2 px-2 text-fg">
        <Mark size={16} />
        <span className="text-sm font-medium tracking-tight">agentox</span>
      </Link>
      <WorkspaceSwitcher onCreate={() => setNewCompanyOpen(true)} />

      <nav className="mt-1 min-h-0 flex-1 overflow-y-auto">
        <NavGroup label="Operate">
          <NavItem to={base} end icon={<Gauge />} label="Overview" />
          <NavItem to={`${base}/live`} icon={<Radio />} label="Live" live={liveRuns.length > 0} />
          <NavItem to={`${base}/runs`} icon={<Activity />} label="Runs" count={liveRuns.length} />
          <NavItem to={`${base}/tasks`} icon={<SquareCheck />} label="Tasks" />
          <NavItem to={`${base}/approvals`} icon={<ShieldCheck />} label="Approvals" count={pending.length} />
        </NavGroup>
        <NavGroup label="Team">
          <NavItem to={`${base}/agents`} icon={<Bot />} label="Agents" />
          <NavItem to={`${base}/members`} icon={<Users />} label="Members" count={accessRequests.length || undefined} />
          <NavItem to={`${base}/spend`} icon={<CircleDollarSign />} label="Spend" />
        </NavGroup>
        <NavGroup label="Configure">
          <NavItem to={`${base}/integrations`} icon={<Plug />} label="Integrations" />
          <NavItem to={`${base}/settings`} icon={<Settings />} label="Settings" />
        </NavGroup>
      </nav>

      <div className="border-t border-line pt-2">
        <UserMenu />
      </div>
    </div>
  );

  return (
    <div className="grain flex h-full">
      <aside className="hidden w-[232px] shrink-0 border-r border-line bg-canvas lg:block">{sidebar}</aside>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
          <aside className="enter absolute inset-y-0 left-0 w-[260px] border-r border-line-2 bg-canvas">{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col bg-canvas">
        <TopBar onMenu={() => setDrawer(true)} onNew={() => setNewIssueOpen(true)} onSearch={() => setPaletteOpen(true)} />
        {auth.reconnecting && (
          <div role="status" className="hatch flex h-8 shrink-0 items-center justify-center gap-2 border-b border-line-2 text-xs text-fg-2">
            <Spinner className="size-2.5" /> Connection to the server lost. Reconnecting…
          </div>
        )}
        <main className="relative min-h-0 flex-1 overflow-y-auto">
          <div className="grid-paper pointer-events-none absolute inset-x-0 top-0 h-[420px]" aria-hidden />
          <div className="relative mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6">
            <Outlet />
          </div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNewTask={() => setNewIssueOpen(true)} />
      <NewIssueModal open={newIssueOpen} onClose={() => setNewIssueOpen(false)} />
      <CreateCompanyModal open={newCompanyOpen} onClose={() => setNewCompanyOpen(false)} />
    </div>
  );
}

export function Layout() {
  return (
    <CrumbsProvider>
      <Shell />
    </CrumbsProvider>
  );
}

