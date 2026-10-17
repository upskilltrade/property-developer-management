"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Building2,
  ChevronDown,
  ChevronsUpDown,
  Gauge,
  Handshake,
  HardHat,
  Home,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  PieChart,
  Search,
  Settings2,
  ShieldCheck,
  Wallet,
  X,
  Check,
  Languages,
} from "lucide-react";
import { cn } from "@/components/ui/cn";

const icons = {
  dashboard: LayoutDashboard,
  projects: Building2,
  finance: Landmark,
  sales: Handshake,
  access: ShieldCheck,
  overview: Gauge,
  setup: Settings2,
  projectFinance: Wallet,
  investor: PieChart,
  contractor: HardHat,
  customer: Home,
} as const;

export type NavIcon = keyof typeof icons;
export type NavItem = { label: string; href: string; icon: NavIcon; exact?: boolean };
export type NavSection = { label: string; items: NavItem[] };
export type ShellProject = { id: string; code: string; name: string };

type Labels = {
  appName: string;
  project: string;
  selectProject: string;
  allProjects: string;
  search: string;
  signOut: string;
  language: string;
  overview: string;
  setup: string;
  projectFinance: string;
};

export function AppShell({
  locale,
  sections,
  projects,
  labels,
  user,
  signOut,
  children,
}: {
  locale: string;
  sections: NavSection[];
  projects: ShellProject[];
  labels: Labels;
  user: { name: string; email: string; roles: string[] };
  signOut: (fd: FormData) => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  // The drawer is open only for the path it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const mobileOpen = openOn === pathname;
  const setMobileOpen = (open: boolean) => setOpenOn(open ? pathname : null);

  const match = pathname.match(new RegExp(`^/${locale}/app/projects/([0-9a-f-]{36})`));
  const currentProject = match ? projects.find((p) => p.id === match[1]) : undefined;
  const base = `/${locale}/app`;

  const projectSection: NavSection | null = currentProject
    ? {
        label: labels.project,
        items: [
          {
            label: labels.overview,
            href: `${base}/projects/${currentProject.id}`,
            icon: "overview",
            exact: true,
          },
          {
            label: labels.setup,
            href: `${base}/projects/${currentProject.id}/setup`,
            icon: "setup",
          },
          {
            label: labels.projectFinance,
            href: `${base}/projects/${currentProject.id}/finance`,
            icon: "projectFinance",
          },
        ],
      }
    : null;

  const allSections = projectSection
    ? [sections[0], projectSection, ...sections.slice(1)].filter(Boolean)
    : sections;

  const sidebar = (
    <div className="flex h-full flex-col bg-nav text-nav-ink">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/5 px-4">
        <div className="grid size-7 place-items-center rounded-md bg-brand text-[11px] font-bold text-white">
          DP
        </div>
        <span className="text-[13px] font-semibold tracking-tight text-white">
          {labels.appName}
        </span>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-4">
        {allSections.map((section, i) => (
          <div key={`${section.label}-${i}`}>
            <p className="mb-1 px-2 text-[10px] font-semibold tracking-[0.12em] text-nav-muted uppercase">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = icons[item.icon];
                const active = item.exact
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors",
                        active
                          ? "bg-nav-active font-medium text-white shadow-[inset_2px_0_0_var(--color-blue-400)]"
                          : "hover:bg-nav-hover hover:text-white",
                      )}
                    >
                      <Icon className="size-4 shrink-0 opacity-80" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/5 p-3 text-[11px] text-nav-muted">
        <p className="truncate font-medium text-nav-ink">{user.name}</p>
        <p className="truncate">{user.roles.join(" · ") || user.email}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 hidden h-dvh lg:block">{sidebar}</aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 shadow-xl">{sidebar}</aside>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="absolute top-3 left-[268px] grid size-8 place-items-center rounded-md bg-white text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-line bg-surface/95 px-3 backdrop-blur sm:px-4">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
            className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-slate-100 lg:hidden"
          >
            <Menu className="size-4" />
          </button>
          {projects.length ? (
            <ProjectSwitcher
              locale={locale}
              projects={projects}
              current={currentProject}
              labels={labels}
            />
          ) : null}
          <div className="ml-auto flex items-center gap-1">
            <LocaleSwitch locale={locale} pathname={pathname} label={labels.language} />
            <UserMenu user={user} locale={locale} signOut={signOut} label={labels.signOut} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-4 sm:px-5 sm:py-5">
          {children}
        </main>
      </div>
    </div>
  );
}

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

function ProjectSwitcher({
  locale,
  projects,
  current,
  labels,
}: {
  locale: string;
  projects: ShellProject[];
  current?: ShellProject;
  labels: Labels;
}) {
  const { open, setOpen, ref } = usePopover();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? projects.filter((p) => `${p.code} ${p.name}`.toLowerCase().includes(q))
    : projects;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-8 max-w-[52vw] items-center gap-2 rounded-md border border-line px-2.5 text-[13px] hover:bg-subtle sm:max-w-xs"
      >
        <Building2 className="size-3.5 shrink-0 text-muted" />
        {current ? (
          <span className="truncate">
            <span className="font-mono text-2xs text-muted">{current.code}</span>{" "}
            <span className="font-medium">{current.name}</span>
          </span>
        ) : (
          <span className="truncate text-muted">{labels.selectProject}</span>
        )}
        <ChevronsUpDown className="size-3.5 shrink-0 text-faint" />
      </button>
      {open ? (
        <div className="absolute top-9 left-0 z-40 w-80 overflow-hidden rounded-lg border border-line bg-surface shadow-xl">
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search className="size-3.5 text-faint" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={labels.search}
              className="h-9 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint"
            />
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {filtered.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/${locale}/app/projects/${p.id}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-3 py-1.5 text-[13px] hover:bg-slate-50"
                >
                  <span className="w-16 shrink-0 font-mono text-2xs text-muted">{p.code}</span>
                  <span className="flex-1 truncate">{p.name}</span>
                  {current?.id === p.id ? <Check className="size-3.5 text-brand" /> : null}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href={`/${locale}/app/projects`}
            onClick={() => setOpen(false)}
            className="block border-t border-line px-3 py-2 text-2xs font-medium text-brand hover:bg-slate-50"
          >
            {labels.allProjects} →
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function LocaleSwitch({
  locale,
  pathname,
  label,
}: {
  locale: string;
  pathname: string;
  label: string;
}) {
  const swap = (target: string) => pathname.replace(/^\/(th|en)(?=\/|$)/, `/${target}`);
  return (
    <div
      className="flex h-8 items-center rounded-md border border-line p-0.5 text-2xs font-semibold"
      aria-label={label}
    >
      <Languages className="mx-1.5 size-3.5 text-faint" />
      {(["th", "en"] as const).map((l) => (
        <Link
          key={l}
          href={swap(l)}
          className={cn(
            "rounded px-2 py-1 uppercase",
            locale === l ? "bg-ink text-white" : "text-muted hover:text-ink",
          )}
        >
          {l}
        </Link>
      ))}
    </div>
  );
}

function UserMenu({
  user,
  locale,
  signOut,
  label,
}: {
  user: { name: string; email: string; roles: string[] };
  locale: string;
  signOut: (fd: FormData) => Promise<void>;
  label: string;
}) {
  const { open, setOpen, ref } = usePopover();
  const initials = user.name.slice(0, 2).toUpperCase();
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-8 items-center gap-1.5 rounded-md px-1.5 hover:bg-slate-100"
      >
        <span className="grid size-6 place-items-center rounded-full bg-slate-800 text-[10px] font-semibold text-white">
          {initials}
        </span>
        <ChevronDown className="size-3.5 text-faint" />
      </button>
      {open ? (
        <div className="absolute top-9 right-0 z-40 w-64 overflow-hidden rounded-lg border border-line bg-surface shadow-xl">
          <div className="border-b border-line px-3 py-2.5">
            <p className="truncate text-[13px] font-medium">{user.name}</p>
            <p className="truncate text-2xs text-muted">{user.email}</p>
            {user.roles.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {user.roles.map((r) => (
                  <span
                    key={r}
                    className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-ink-2"
                  >
                    {r}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <form action={signOut}>
            <input type="hidden" name="locale" value={locale} />
            <button
              type="submit"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-red-700 hover:bg-red-50"
            >
              <LogOut className="size-3.5" />
              {label}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
