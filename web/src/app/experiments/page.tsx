'use client';
import { t } from '@/lib/i18n';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FlaskConical, Search } from 'lucide-react';
import { useActions, useExperiments, useProjects } from '@/lib/hooks';
import { useStatuses } from '@/lib/statuses';
import { cn, taskHref } from '@/lib/utils';
import { Empty, Spinner, inputCls } from '@/components/ui';
import TaskViews, { HideDoneToggle, ViewSwitcher, useHideDone, useViewMode, type VTask } from '@/components/TaskViews';
import type { Status } from '@/lib/types';

export default function ExperimentsPage() {
  const router = useRouter();
  const actions = useActions();
  const { data, isLoading } = useExperiments();
  const { data: projects } = useProjects();
  const [view, setView] = useViewMode();
  const st = useStatuses();
  const [hideDone, setHideDone] = useHideDone();
  const [project, setProject] = useState('all');
  const [status, setStatus] = useState<Status | 'all'>('all');
  const [q, setQ] = useState('');

  const filterHides = hideDone && view !== 'board' && status === 'all';
  const hiddenCount = filterHides
    ? (data ?? []).filter((t) => (project === 'all' || t.projectId === project) && st.isDone(t.status) && (!q.trim() || t.title.toLowerCase().includes(q.trim().toLowerCase()))).length
    : 0;
  const tasks: VTask[] = useMemo(() => (data ?? [])
    .filter((t) => (project === 'all' || t.projectId === project) && (status === 'all' || t.status === status)
      && (!q.trim() || t.title.toLowerCase().includes(q.trim().toLowerCase()))
      && !(filterHides && st.isDone(t.status)))
    .map((t) => ({
      id: t.id, projectId: t.projectId, title: t.title, status: t.status, dueDate: t.dueDate, createdAt: t.createdAt,
      labels: t.labels.map((l) => ({ ...l, projectId: t.projectId })), depCount: t.dependsOnIds.length,
      logs: t.logs, metrics: t.project.metrics, project: { id: t.project.id, title: t.project.title, color: t.project.color },
    })), [data, project, status, q, filterHides, st]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = (s: Status | 'all') => (data ?? []).filter((t) => (project === 'all' || t.projectId === project) && (s === 'all' || t.status === s)).length;

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-[1400px] px-6 py-8 md:px-8">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Experiments</h1>
            <p className="mt-1 text-sm text-muted-fg">{t("Task và thí nghiệm của mọi dự án")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {view !== 'board' && <HideDoneToggle value={hideDone} onChange={setHideDone} hidden={hiddenCount} />}
            <ViewSwitcher value={view} onChange={setView} />
          </div>
        </header>

        <div className="mb-6 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" />
            <input className={cn(inputCls, 'w-56 pl-9')} placeholder={t("Tìm experiment…")} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className={cn(inputCls, 'w-52')} value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="all">{t("Mọi dự án")}</option>
            {projects?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          {(['all', ...st.grouped.map((d) => d.key)] as (Status | 'all')[]).map((s) => (
            <button key={s} onClick={() => setStatus(s)}
              className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition',
                status === s ? 'border-primary bg-soft text-primary' : 'bg-card hover:bg-muted')}>
              {s !== 'all' && <span className="h-2 w-2 rounded-full" style={{ background: st.meta(s).color }} />}
              {s === 'all' ? t("Tất cả") : st.meta(s).name}
              <span className="text-muted-fg">{count(s)}</span>
            </button>
          ))}
        </div>

        {isLoading ? <div className="flex justify-center py-16"><Spinner /></div> : tasks.length === 0 ? (
          <Empty icon={<FlaskConical size={24} />} title={t("Không có experiment phù hợp")} hint={t("Thử đổi bộ lọc, hoặc thêm task trong một dự án.")} />
        ) : (
          <TaskViews tasks={tasks} view={view} showProject
            onOpen={(t) => router.push(taskHref(t.projectId, t.id))}
            onStatus={(t, s) => actions.updateTask(t.id, { status: s })} />
        )}
      </div>
    </div>
  );
}
