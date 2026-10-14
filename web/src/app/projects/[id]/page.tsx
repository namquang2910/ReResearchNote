'use client';
import { t } from '@/lib/i18n';
import { useMemo, useState } from 'react';
import { ListChecks, Plus, Search, Sparkles } from 'lucide-react';
import { useQuickAdd } from '@/components/QuickAdd';
import { useProjectCtx } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Button, Empty, Segmented, inputCls } from '@/components/ui';
import TaskViews, { HideDoneToggle, ViewSwitcher, useHideDone, useViewMode, type VTask } from '@/components/TaskViews';
import { useStatuses } from '@/lib/statuses';

export default function TasksPage() {
  const { project, taskId, openTask, actions } = useProjectCtx();
  const [title, setTitle] = useState('');
  const [q, setQ] = useState('');
  const [label, setLabel] = useState('all');
  const [view, setView] = useViewMode();
  const quick = useQuickAdd();
  const st = useStatuses();
  const [hideDone, setHideDone] = useHideDone();

  const filterHides = hideDone && view !== 'board'; // Board luôn giữ cột Hoàn thành
  const matched = project.tasks.filter((t) => (label === 'all' || t.labelIds.includes(label)) && (!q.trim() || t.title.toLowerCase().includes(q.trim().toLowerCase())));
  const hiddenCount = filterHides ? matched.filter((t) => st.isDone(t.status)).length : 0;
  const tasks: VTask[] = useMemo(() => matched
    .filter((t) => !(filterHides && st.isDone(t.status)))
    .map((t) => ({
      id: t.id, projectId: t.projectId, title: t.title, status: t.status, dueDate: t.dueDate, createdAt: t.createdAt,
      labels: t.labelIds.map((id) => project.labels.find((l) => l.id === id)).filter(Boolean) as VTask['labels'],
      depCount: t.dependsOnIds.length, logs: t.logs, metrics: project.metrics,
    })), [project, label, q, filterHides, st]); // eslint-disable-line react-hooks/exhaustive-deps

  async function add() {
    const v = title.trim();
    if (!v) return;
    setTitle('');
    const t = await actions.createTask(v);
    if (t) openTask(t.id);
  }

  return (
    <div className={cn('mx-auto px-6 py-6 md:px-8', view === 'list' ? 'max-w-4xl' : 'max-w-[1400px]')}>
      <div className="flex gap-2">
        <input className={cn(inputCls, 'h-11 flex-1')} placeholder={t("Thêm task / experiment mới…  (Enter)")} value={title}
          onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <Button variant="primary" className="h-11" onClick={add} disabled={!title.trim()}><Plus size={16} /> {t("Thêm")}</Button>
        <Button className="h-11" onClick={() => quick.open({ projectId: project.id })}><Sparkles size={16} /> {t("Thêm bằng AI")}</Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" />
          <input className={cn(inputCls, 'w-56 pl-9')} placeholder={t("Tìm task…")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {project.labels.length > 0 && (
          <Segmented value={label} onChange={setLabel}
            options={[{ value: 'all', label: t("Tất cả") }, ...project.labels.map((l) => ({ value: l.id, label: l.name }))]} />
        )}
        <span className="flex-1" />
        {view !== 'board' && <HideDoneToggle value={hideDone} onChange={setHideDone} hidden={hiddenCount} />}
        <ViewSwitcher value={view} onChange={setView} />
      </div>

      <div className="mt-6">
        {project.tasks.length === 0 ? (
          <Empty icon={<ListChecks size={24} />} title={t("Chưa có task nào")} hint={t("Mỗi task là một thí nghiệm hoặc đầu việc. Gõ tên ở trên rồi nhấn Enter để thêm.")} />
        ) : tasks.length === 0 ? (
          <p className="text-center text-sm text-muted-fg">
            {hiddenCount > 0 ? t('Tất cả {n} task khớp đều đã hoàn thành (đang ẩn).', { n: hiddenCount }) : t('Không có task phù hợp bộ lọc.')}
          </p>
        ) : (
          <TaskViews tasks={tasks} view={view} selectedId={taskId} metricCols={project.metrics}
            onOpen={(t) => openTask(t.id)} onStatus={(t, s) => actions.updateTask(t.id, { status: s })} />
        )}
      </div>
    </div>
  );
}
