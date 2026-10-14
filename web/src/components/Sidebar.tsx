'use client';
import { t } from '@/lib/i18n';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CalendarDays, FlaskConical, FolderKanban, Home, Monitor, Moon, Plus, Search, Sparkles, Star, StickyNote, Sun } from 'lucide-react';
import { usePrefs } from '@/lib/prefs';
import { useAuth } from '@/lib/auth';
import { useActions, useProjects } from '@/lib/hooks';
import { useQuickAdd } from './QuickAdd';
import { cn } from '@/lib/utils';
import { Button, Modal, inputCls } from './ui';

export function NewProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const actions = useActions();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [metrics, setMetrics] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim()) return;
    setBusy(true);
    const p = await actions.createProject({
      title: title.trim(), description: desc.trim(),
      metrics: metrics.split(',').map((s) => s.trim()).filter(Boolean),
    });
    setBusy(false);
    if (p) { setTitle(''); setDesc(''); setMetrics(''); onClose(); router.push(`/projects/${p.id}`); }
  }
  return (
    <Modal open={open} onClose={onClose} title={t("Dự án mới")}>
      <div className="space-y-3">
        <input autoFocus className={inputCls} placeholder={t("Tên dự án")} value={title} onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <textarea className={inputCls} rows={3} placeholder={t("Mô tả ngắn (tuỳ chọn)")} value={desc} onChange={(e) => setDesc(e.target.value)} />
        <div>
          <input className={inputCls} placeholder={t("Metrics, cách nhau bằng dấu phẩy")} value={metrics} onChange={(e) => setMetrics(e.target.value)} />
          <p className="mt-1.5 text-xs text-muted-fg">{t("Ví dụ: Macro F1, Accuracy, Loss — thứ tự này sẽ được giữ ở mọi nơi.")}</p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>{t("Hủy")}</Button>
          <Button variant="primary" onClick={submit} disabled={!title.trim() || busy}>{t("Tạo dự án")}</Button>
        </div>
      </div>
    </Modal>
  );
}

const NAV = [
  { href: '/', label: 'Home', icon: Home, match: (p: string) => p === '/' },
  { href: '/projects', label: 'Projects', icon: FolderKanban, match: (p: string) => p === '/projects' },
  { href: '/experiments', label: 'Experiments', icon: FlaskConical, match: (p: string) => p.startsWith('/experiments') },
  { href: '/notes', label: 'Notes', icon: StickyNote, match: (p: string) => p === '/notes' },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays, match: (p: string) => p.startsWith('/calendar') },
  { href: '/search', label: 'Search', icon: Search, match: (p: string) => p.startsWith('/search') },
];

/** Nội dung sidebar (dùng cho cột cố định ở desktop và ngăn kéo ở di động). */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: projects } = useProjects();
  const [open, setOpen] = useState(false);
  const quick = useQuickAdd();
  const { lang, setLang, theme, setTheme } = usePrefs();
  const { user } = useAuth();
  const name = user?.name || user?.email?.split('@')[0] || '';
  const favorites = projects?.filter((p) => p.favorite) ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col" onClick={(e) => { if ((e.target as HTMLElement).closest('a')) onNavigate?.(); }}>
      <Link href="/" className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-primary dark:text-primary-fg"><FlaskConical size={16} /></span>
        <span className="text-[15px] font-semibold tracking-tight">ReSearch</span>
      </Link>

      <div className="px-3 pb-3">
        <button onClick={() => { onNavigate?.(); quick.open(); }}
          className="flex w-full items-center gap-2.5 rounded-xl border bg-soft px-3 py-2.5 text-sm font-medium text-primary transition hover:border-primary">
          <Sparkles size={16} /> {t('Thêm nhanh bằng AI')}
          <kbd className="ml-auto rounded border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-fg">⌘K</kbd>
        </button>
      </div>

      <nav className="space-y-0.5 px-3">
        {NAV.map((n) => {
          const active = n.match(pathname);
          return (
            <Link key={n.href} href={n.href}
              className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                active ? 'bg-soft text-primary' : 'text-muted-fg hover:bg-muted hover:text-fg')}>
              <n.icon size={18} />{n.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 px-6 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-fg">Favorites</div>
      <div className="flex-1 space-y-0.5 overflow-auto px-3">
        {favorites.map((p) => (
          <Link key={p.id} href={`/projects/${p.id}`}
            className={cn('flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition hover:bg-muted',
              pathname.startsWith(`/projects/${p.id}`) && 'bg-muted font-medium')}>
            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-md text-white" style={{ background: p.color }}>
              <Star size={11} className="fill-current" />
            </span>
            <span className="truncate">{p.title}</span>
          </Link>
        ))}
        {projects && favorites.length === 0 && <p className="px-3 py-1 text-xs text-muted-fg">{t("Bấm ★ ở một dự án để ghim vào đây.")}</p>}
        <button onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-fg transition hover:bg-muted hover:text-fg">
          <Plus size={18} className="flex-none" /> {t('Dự án mới')}
        </button>
      </div>

      {/* Profile + tuỳ chọn nhanh */}
      <div className="border-t p-3">
        <Link href="/profile"
          className={cn('flex items-center gap-3 rounded-xl px-2.5 py-2 transition hover:bg-muted', pathname.startsWith('/profile') && 'bg-soft')}>
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-fg">
            {(name || '?').trim().charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-medium">{name}</span>
            <span className="block truncate text-xs text-muted-fg">{user?.email ?? 'Profile'}</span>
          </span>
        </Link>
        <div className="mt-2 flex items-center gap-1.5 px-1">
          <button onClick={() => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')}
            title={`${t('Giao diện')}: ${theme === 'light' ? t('Sáng') : theme === 'dark' ? t('Tối') : t('Theo hệ thống')}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg border text-muted-fg transition hover:bg-muted hover:text-fg">
            {theme === 'light' ? <Sun size={15} /> : theme === 'dark' ? <Moon size={15} /> : <Monitor size={15} />}
          </button>
          <div className="ml-auto inline-flex rounded-lg bg-muted p-0.5 text-[11px] font-semibold">
            {(['vi', 'en'] as const).map((l) => (
              <button key={l} onClick={() => setLang(l)}
                className={cn('rounded-md px-2.5 py-1 transition', lang === l ? 'bg-card text-fg shadow-card' : 'text-muted-fg hover:text-fg')}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
      <NewProjectModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

export default function Sidebar() {
  return (
    <aside className="hidden h-full w-60 flex-none flex-col border-r bg-card md:flex">
      <SidebarContent />
    </aside>
  );
}
