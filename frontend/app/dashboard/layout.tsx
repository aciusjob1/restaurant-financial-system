'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { BarChart3, Cog, LayoutDashboard } from 'lucide-react';
import { AppSidebar, type NavLink } from '@/components/ui/AppSidebar';
import { apiFetch, ApiError } from '@/lib/api';

type MeResponse = {
  success: true;
  user: { id: string; username: string; fullName: string; role: string; isActive: boolean };
};

const ALLOWED_ROLES = new Set(['OWNER', 'MANAGER', 'AUDITOR']);

const LINKS: NavLink[] = [
  { href: '/dashboard', label: 'Dashboard',  icon: LayoutDashboard },
  { href: '/ops',       label: 'Operations', icon: Cog },
  { href: '/reports',   label: 'Reports',    icon: BarChart3 },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse['user'] | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<MeResponse>('/api/v1/auth/me')
      .then((res) => {
        if (cancelled) return;
        // WAITERs have their own surface.
        if (res.user.role === 'WAITER') { router.push('/kiosk'); return; }
        if (!ALLOWED_ROLES.has(res.user.role)) { setDenied(true); return; }
        setMe(res.user);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) router.push('/login');
        else setDenied(true);
      });
    return () => { cancelled = true; };
  }, [router]);

  if (denied) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
          <p className="font-medium">You do not have permission to view the dashboard.</p>
          <Link
            href="/login"
            className="mt-4 inline-block rounded-lg bg-slate-900 text-white px-4 py-2 text-sm"
          >
            Return to login
          </Link>
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="text-slate-500">Checking access…</div>
      </div>
    );
  }

  return (
    <AppSidebar
      title="Dashboard"
      homeHref="/dashboard"
      links={LINKS}
      storageKey="dashboard-shell-collapsed"
      me={me}
    >
      {children}
    </AppSidebar>
  );
}