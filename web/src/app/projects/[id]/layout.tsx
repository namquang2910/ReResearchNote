'use client';
import { t } from '@/lib/i18n';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { BarChart3, ListChecks, Network, Pencil, Settings, Star, StickyNote } from 'lucide-react';
import EditProjectModal from '@/components/EditProjectModal';
import { ProjectCtx, useActions, useProject } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui';
import TaskDrawer from '@/components/TaskDrawer';
import ProjectStats from '@/components/ProjectStats';

const TABS = [
  { href: '', label: 'Tasks', icon: ListChecks },
  { href: '/graph', label: 'Graph', icon: Network },
  { href: '/analytics', label: 'Phân tích', icon: BarChart3 },
  { href: '/notes', label: 'Notes', icon: StickyNote },
  { href: '/settings', label: 'Cấu hình', icon: Settings },
];

export default function ProjectLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const { data: project, isLoading, error } = useProject(id);
  const actions = useActions(id);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [reqTab, setReqTab] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const initial = useRef<{ task: string | null; tab: string | null } | null>(null);
  const openTask = (tid: string | null, tab?: string) => { setTaskId(tid); setReqTab(tab ?? null); };

  // mở sẵn task từ liên kết ?task=…&tab=… (Home, Calendar, Search…)
  useEffect(() => {
    try { localStorage.setItem('lastProject', id); } catch {}
    // giữ qua ref: StrictMode chạy effect hai lần, lần hai URL đã bị xóa query
    if (!initial.current) {
      const q = new URLSearchParams(window.location.search);
      initial.current = { task: q.get('task'), tab: q.get('tab') };
      if (q.has('task')) window.history.replaceState(null, '', window.location.pathname);
    }
    setTaskId(initial.current.task);
    setReqTab(initial.current.tab);
    setTimeout(() => { initial.current = null; }, 0);
  }, [id]);
  useEffect(() => { if (error && !project) router.replace('/'); }, [error, project, router]);

  if (isLoading || !project) return <div className="flex flex-1 items-center justify-center"><Spinner /></div>;

  const base = `/projects/${id}`;
  const isGraph = pathname === base + '/graph';

  return (
    <ProjectCtx.Provider value={{ project, taskId, reqTab, openTask, actions }}>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex-none border-b bg-card px-6 pt-5 md:px-8">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 flex-none rounded-md" style={{ background: project.color }} />
              <div className="min-w-0 flex-1"><EditableTitle key={project.id + 't'} value={project.title} onSave={(title) => actions.updateProject({ title })} /></div>
              <button onClick={() => setEditing(true)} title={t("Chỉnh sửa dự án")} className="rounded-lg p-2 text-muted-fg transition hover:bg-muted hover:text-fg">
                <Pencil size={17} />
              </button>
              <button onClick={() => actions.updateProject({ favorite: !project.favorite })} title={project.favorite ? t("Bỏ khỏi Favorites") : t("Thêm vào Favorites")}
                className={cn('rounded-lg p-2 transition hover:bg-muted', project.favorite ? 'text-amber-500' : 'text-muted-fg')}>
                <Star size={18} className={project.favorite ? 'fill-current' : ''} />
              </button>
            </div>
            <EditableDesc key={project.id + 'd'} value={project.description} onSave={(description) => actions.updateProject({ description })} />

            <ProjectStats project={project} />

            <nav className="-mb-px mt-4 flex gap-1 overflow-x-auto">
              {TABS.map((tab) => {
                const href = base + tab.href;
                const active = tab.href === '' ? pathname === base : pathname.startsWith(href);
                return (
                  <Link key={tab.href} href={href}
                    className={cn('flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition',
                      active ? 'border-primary text-primary' : 'border-transparent text-muted-fg hover:text-fg')}>
                    <tab.icon size={16} />{t(tab.label)}
                    {tab.href === '' && <span className="rounded-md bg-muted px-1.5 text-xs text-muted-fg">{project.tasks.length}</span>}
                  </Link>
                );
              })}
            </nav>
          </header>
          <div className={cn('min-h-0 flex-1', isGraph ? 'overflow-hidden' : 'overflow-auto')}>{children}</div>
        </div>
        <TaskDrawer />
        <EditProjectModal project={editing ? { id: project.id, title: project.title, description: project.description, color: project.color, favorite: project.favorite, taskCount: project.tasks.length } : null} onClose={() => setEditing(false)} />
      </div>
    </ProjectCtx.Provider>
  );
}

function EditableTitle({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <input value={v} onChange={(e) => setV(e.target.value)} placeholder={t("Tên dự án")}
      onBlur={() => v.trim() && v !== value && onSave(v.trim())}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="-ml-2 w-full rounded-lg border border-transparent bg-transparent px-2 py-0.5 text-2xl font-semibold tracking-tight outline-none hover:border-border focus:border-primary" />
  );
}
function EditableDesc({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }, [v]);
  return (
    <textarea ref={ref} rows={1} value={v} onChange={(e) => setV(e.target.value)} placeholder={t("Thêm mô tả dự án…")}
      onBlur={() => v !== value && onSave(v)}
      className="-ml-2 mt-0.5 block w-full resize-none rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-muted-fg outline-none hover:border-border focus:border-primary" />
  );
}
