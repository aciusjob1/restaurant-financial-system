'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  type LucideIcon,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

export type NavLink = { href: string; label: string; icon: LucideIcon };

type AppSidebarProps = {
  title: string;
  homeHref: string;
  links: NavLink[];
  storageKey: string;
  me: { fullName: string; role: string };
  children: ReactNode;
};

/**
 * Shared application sidebar used by /ops, /reports, and /dashboard.
 *
 * Behaviour:
 *  - Desktop (lg+): fixed rail, toggles 240px <-> 64px, persisted per
 *    storageKey in localStorage.
 *  - Tablet/mobile: off-canvas drawer with backdrop; closes on link
 *    navigation, backdrop click, or Escape.
 *  - Sign-out is owned here so consumers do not duplicate the call.
 */
export function AppSidebar({
  title,
  homeHref,
  links,
  storageKey,
  me,
  children,
}: AppSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) === '1') setCollapsed(true);
    } catch { /* ignore */ }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(storageKey, collapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsed, hydrated, storageKey]);

  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await apiFetch('/api/v1/auth/logout', { method: 'POST' });
    } catch { /* fall through — still send the user to /login */ }
    router.push('/login');
  }

  const widthCls = collapsed ? 'lg:w-16' : 'lg:w-60';
  const padCls   = collapsed ? 'lg:pl-16' : 'lg:pl-60';

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
              collapsed ? 'lg:hidden' : '',
            ].join(' ')}
          >
            {title}
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className={[
              'hidden lg:inline-flex p-1.5 rounded-lg hover:bg-slate-100',
              collapsed ? 'mx-auto' : 'ml-auto',
            ].join(' ')}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed
              ? <PanelLeftOpen className="w-4 h-4 text-slate-600" />
              : <PanelLeftClose className="w-4 h-4 text-slate-600" />}
          </button>
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
          {links.map((l) => {
            const Icon = l.icon;
            const active = pathname === l.href || (pathname?.startsWith(l.href + '/') ?? false);
            return (
              <Link
                key={l.href}
                href={l.href}
                title={collapsed ? l.label : undefined}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex items-center gap-3 mx-2 my-0.5 px-2 py-2 rounded-lg text-sm',
                  active
                    ? 'bg-slate-900 text-white hover:bg-slate-900'
                    : 'text-slate-700 hover:bg-slate-100',
                  collapsed ? 'lg:justify-center lg:px-0' : '',
                ].join(' ')}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className={collapsed ? 'lg:hidden' : ''}>{l.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer: user + sign-out */}
        <div className="border-t border-slate-200 p-3 space-y-2">
          <div className={['flex items-center gap-2', collapsed ? 'lg:hidden' : ''].join(' ')}>
            <div className="w-7 h-7 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center shrink-0">
              {me.fullName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-slate-900 truncate">{me.fullName}</div>
              <div className="text-[10px] text-slate-500">{me.role}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            title={collapsed ? 'Sign out' : undefined}
            className={[
              'flex items-center gap-2 w-full px-2 py-2 rounded-lg text-sm',
              'text-slate-700 hover:bg-slate-100 disabled:opacity-60',
              collapsed ? 'lg:justify-center lg:px-0' : '',
            ].join(' ')}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span className={collapsed ? 'lg:hidden' : ''}>
              {signingOut ? 'Signing out…' : 'Sign out'}
            </span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className={['transition-[padding] duration-200', padCls].join(' ')}>
        <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">{children}</div>
      </main>
    </div>
  );
}