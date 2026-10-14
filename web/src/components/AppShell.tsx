'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Menu, X } from 'lucide-react';
import { AUTH_EXPIRED } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { t } from '@/lib/i18n';
import Sidebar, { SidebarContent } from './Sidebar';
import { Spinner } from './ui';

const PUBLIC_PATHS = ['/login', '/reset-password', '/verify-email'];

/** Khung ứng dụng: chặn người chưa đăng nhập, sidebar cố định (desktop) hoặc ngăn kéo (di động). */
export default function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, config } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const [drawer, setDrawer] = useState(false);
  const [sent, setSent] = useState(false);
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // đóng ngăn kéo khi đổi trang
  useEffect(() => { setDrawer(false); }, [pathname]);

  // phiên hết hạn giữa chừng (API trả 401)
  useEffect(() => {
    const h = () => { qc.setQueryData(['me'], null); };
    window.addEventListener(AUTH_EXPIRED, h);
    return () => window.removeEventListener(AUTH_EXPIRED, h);
  }, [qc]);

  useEffect(() => {
    if (loading) return;
    if (!user && !isPublic) {
      const next = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + window.location.search)}`;
      router.replace('/login' + next);
    }
  }, [loading, user, isPublic, pathname, router]);

  if (isPublic) return <>{children}</>;
  if (loading || !user) return <div className="flex h-screen items-center justify-center"><Spinner className="h-6 w-6" /></div>;

  return (
    <div className="flex h-screen flex-col overflow-hidden md:flex-row">
      {/* thanh trên cho di động */}
      <header className="flex flex-none items-center gap-3 border-b bg-card px-4 py-3 md:hidden">
        <button onClick={() => setDrawer(true)} aria-label="Menu" className="rounded-lg p-1.5 text-muted-fg hover:bg-muted"><Menu size={22} /></button>
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-primary dark:text-primary-fg"><FlaskConical size={15} /></span>
          <span className="font-semibold tracking-tight">ReSearch</span>
        </Link>
      </header>
      {drawer && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 animate-fade bg-black/40" onClick={() => setDrawer(false)} />
          <aside className="relative flex h-full w-72 max-w-[85vw] animate-slide flex-col bg-card shadow-pop">
            <button onClick={() => setDrawer(false)} aria-label="Close" className="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-muted-fg hover:bg-muted"><X size={18} /></button>
            <SidebarContent onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {config?.mail && !user.emailVerified && (
          <div role="status" className="flex flex-none flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-500/15 px-4 py-2 text-sm text-amber-700 dark:text-amber-300">
            <span>{sent ? t('Đã gửi email xác minh. Hãy kiểm tra hộp thư.') : t('Email của bạn chưa được xác minh.')}</span>
            {!sent && (
              <button className="font-semibold underline" onClick={async () => { try { await api.post('/auth/send-verification'); } catch {} setSent(true); }}>
                {t('Gửi lại email xác minh')}
              </button>
            )}
          </div>
        )}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
