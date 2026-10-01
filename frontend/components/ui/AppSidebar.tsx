'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import {
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  type LucideIcon,
} from 'lucide-react';

export type NavLink = { href: string; label: string; icon: LucideIcon; section?: string };

type AppSidebarProps = {
  title: string;
  homeHref: string;
  links: NavLink[];
  storageKey: string;
  me: { fullName: string; role: string };
  children: ReactNode;
};

/**
 * How long the user must be idle before the rail auto-collapses on
 * wide desktops. Tune here. 0 disables idle-collapse entirely.
 */
const IDLE_COLLAPSE_MS = 10_000;

/**
 * Small matchMedia hook. Returns true when the viewport currently
 * matches the supplied media query, and updates on resize.
 *
 * Runs client-side only (the component is marked 'use client').
 */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const handler = () => setMatches(mql.matches);
    handler();
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

/**
 * Shared application sidebar used by /ops, /reports, and /dashboard.
 *
 * Responsive tiers:
 *   - below lg (1024px): off-canvas drawer with backdrop
 *   - lg to xl (1024-1280px): auto-collapsed icon rail; the toggle
 *     button is hidden because resizing is the way to expand
 *   - xl and up (1280px+): manual toggle, persisted per storageKey,
 *     plus an idle auto-collapse after IDLE_COLLAPSE_MS of no input
 *
 * Sign-out is owned here so consumers do not duplicate the call.
 */
export function AppSidebar({
  title,
  homeHref,
  links,
  storageKey,
  me,
  children,
}: AppSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);       // user preference
  const [hydrated, setHydrated] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [idleCollapsed, setIdleCollapsed] = useState(false); // transient

  // Viewport tier checks.
  const isMedium = useMediaQuery('(min-width: 1024px) and (max-width: 1279.98px)');
  const isWide   = useMediaQuery('(min-width: 1280px)');

  // Read persisted rail state once on mount.
  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) === '1') setCollapsed(true);
    } catch { /* ignore */ }
    setHydrated(true);
  }, [storageKey]);

  // Persist ONLY the user's choice. idleCollapsed is transient and is
  // never written here, so leaving a wide viewport cannot corrupt the
  // user's saved preference.
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(storageKey, collapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsed, hydrated, storageKey]);

  // Idle auto-collapse — wide desktops only, and only when the user's
  // preference is expanded (nothing to hide if they already collapsed).
  // The state is visual: any input clears it and restarts the timer.
  useEffect(() => {
    if (!hydrated || IDLE_COLLAPSE_MS <= 0) return;
    if (!isWide || collapsed) {
      setIdleCollapsed(false);
      return;
    }

    let timer = window.setTimeout(() => setIdleCollapsed(true), IDLE_COLLAPSE_MS);
    const reset = () => {
      setIdleCollapsed(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdleCollapsed(true), IDLE_COLLAPSE_MS);
    };

    // Note: mousedown is deliberately NOT a reset trigger, so that a
    // click on the toggle button (which may happen without any mouse
    // movement) can be interpreted as "un-hide" by handleToggleClick.
    window.addEventListener('mousemove', reset);
    window.addEventListener('keydown', reset);
    window.addEventListener('touchstart', reset);
    window.addEventListener('scroll', reset, { passive: true });

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('mousemove', reset);
      window.removeEventListener('keydown', reset);
      window.removeEventListener('touchstart', reset);
      window.removeEventListener('scroll', reset);
    };
  }, [hydrated, isWide, collapsed]);

  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  // What the rail actually renders as: auto-collapse (viewport OR idle)
  // takes priority over the user's stored preference.
  const effectiveCollapsed = isMedium || collapsed || idleCollapsed;

  function handleToggleClick() {
    // If the rail is collapsed purely because of idle, this click means
    // "show me the rail" — clear the transient state, do not flip the
    // user's preference.
    if (effectiveCollapsed && !collapsed && !isMedium) {
      setIdleCollapsed(false);
      return;
    }
    setCollapsed((v) => !v);
  }

  const widthCls = effectiveCollapsed ? 'lg:w-16' : 'lg:w-60';
  const padCls   = effectiveCollapsed ? 'lg:pl-16' : 'lg:pl-60';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="p-2 -ml-2 rounded-lg hover:bg-slate-100"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5 text-slate-700" />
          </button>
          <span className="font-medium text-slate-900 truncate">{title}</span>
          <span className="ml-auto text-xs text-slate-500 shrink-0">{me.role}</span>
        </div>
      </div>

      {/* Backdrop for the mobile drawer */}
      {drawerOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-slate-900/40 z-30"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 bg-white border-r border-slate-200 flex flex-col',
          'w-60',
          widthCls,
          'transition-[transform,width] duration-200 ease-out',
          drawerOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
      >
        {/* Sidebar header */}
        <div className="flex items-center h-14 px-3 border-b border-slate-200">
          <Link
            href={homeHref}
            className={[
              'font-medium text-slate-900 truncate',
              effectiveCollapsed ? 'lg:hidden' : '',
            ].join(' ')}
          >
            {title}
          </Link>

          {/* Manual toggle — shown on wide (xl+) screens.
              At medium widths the rail is auto-collapsed and the
              toggle would be inert, so we hide it. */}
          {!isMedium && (
            <button
              type="button"
              onClick={handleToggleClick}
              className={[
                'hidden lg:inline-flex p-1.5 rounded-lg hover:bg-slate-100',
                effectiveCollapsed ? 'mx-auto' : 'ml-auto',
              ].join(' ')}
              aria-label={effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {effectiveCollapsed
                ? <PanelLeftOpen className="w-4 h-4 text-slate-600" />
                : <PanelLeftClose className="w-4 h-4 text-slate-600" />}
            </button>
          )}

          {/* When auto-collapsed on medium, show a static icon as a
              visual indicator that the rail is what it is. */}
          {isMedium && (
            <span
              className="hidden lg:inline-flex mx-auto p-1.5 text-slate-400"
              title="Auto-collapsed — widen the window to expand"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </span>
          )}

          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="lg:hidden ml-auto p-1.5 rounded-lg hover:bg-slate-100"
            aria-label="Close menu"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2">
          {links.map((l, idx) => {
            const Icon = l.icon;
            const active = pathname === l.href || (pathname?.startsWith(l.href + '/') ?? false);
            const prevSection = idx > 0 ? links[idx - 1].section : undefined;
            const showSection = l.section && l.section !== prevSection;
            return (
              <Fragment key={l.href}>
                {showSection && !effectiveCollapsed && (
                  <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wide text-slate-400">
                    {l.section}
                  </div>
                )}
                <Link
                  href={l.href}
                  title={effectiveCollapsed ? l.label : undefined}
                  aria-current={active ? 'page' : undefined}
                  className={[
                    'flex items-center gap-3 mx-2 my-0.5 px-2 py-2 rounded-lg text-sm',
                    active
                      ? 'bg-slate-900 text-white hover:bg-slate-900'
                      : 'text-slate-700 hover:bg-slate-100',
                    effectiveCollapsed ? 'lg:justify-center lg:px-0' : '',
                  ].join(' ')}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className={effectiveCollapsed ? 'lg:hidden' : ''}>{l.label}</span>
                </Link>
              </Fragment>
            );
          })}
        </nav>

      </aside>

      {/* Main content */}
      <main className={['transition-[padding] duration-200', padCls].join(' ')}>
        <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">{children}</div>
      </main>
    </div>
  );
}