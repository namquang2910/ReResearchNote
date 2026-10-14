'use client';
import { dateLocale, t } from '@/lib/i18n';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FlaskConical, FolderKanban, Play, Plus, Target, Timer } from 'lucide-react';
import { useActions, useExperiments, useProjects } from '@/lib/hooks';
import { useStatuses } from '@/lib/statuses';
import { ago, cn, sameDay, startOfDay, taskHref } from '@/lib/utils';
import { Button, Card, Spinner } from '@/components/ui';
import { NewProjectModal } from '@/components/Sidebar';
import ProjectCard from '@/components/ProjectCard';
import { CheckButton, StatusPill } from '@/components/task-bits';
import { DueChip } from '@/components/TaskViews';

function greeting(h: number) {
  return h < 12 ? t("Chào buổi sáng") : h < 18 ? t("Chào buổi chiều") : t("Chào buổi tối");
}

export default function HomePage() {
  const router = useRouter();
  const tr = t; // `t` bị che bởi biến task trong các callback
  const actions = useActions();
  const { data: projects, isLoading, error } = useProjects();
  const { data: tasks } = useExperiments();
  const [open, setOpen] = useState(false);
  const st = useStatuses();
  const now = new Date();

  const s = useMemo(() => {
    const all = tasks ?? [];
    const today = startOfDay(now);
    const dueToday = all.filter((t) => t.dueDate && sameDay(new Date(t.dueDate), now));
    const overdue = all.filter((t) => t.dueDate && !st.isDone(t.status) && new Date(t.dueDate) < today);
    const running = all.filter((t) => st.isRunning(t.status));
    return {
      dueToday, overdue, running,
      active: all.filter((t) => st.isRunning(t.status) || st.isTodo(t.status)).length,
      todayList: [...overdue, ...dueToday.filter((t) => !overdue.includes(t))]
        .sort((a, b) => +st.isDone(a.status) - +st.isDone(b.status) || +new Date(a.dueDate!) - +new Date(b.dueDate!)).slice(0, 7),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, st]);

  if (isLoading) return <div className="flex flex-1 items-center justify-center"><Spinner /></div>;
  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center">
        <div><h1 className="text-xl font-semibold">{t("Không kết nối được API")}</h1><p className="mt-2 text-sm text-muted-fg">{(error as Error).message}</p></div>
      </div>
    );
  }
  if (!projects?.length) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-fg"><FlaskConical size={26} /></div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("Chào mừng đến ReSearch")}</h1>
          <p className="mt-2 text-sm text-muted-fg">{t("Tạo dự án nghiên cứu đầu tiên để theo dõi thí nghiệm, metrics và phụ thuộc giữa các task.")}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button variant="primary" onClick={() => setOpen(true)}>{t("Tạo dự án")}</Button>
            <Button onClick={async () => {
              const p = await actions.createSample();
              if (p) router.push(`/projects/${p.id}`);
            }}>{t('Thử với dự án mẫu')}</Button>
          </div>
        </div>
        <NewProjectModal open={open} onClose={() => setOpen(false)} />
      </div>
    );
  }

  const recent = [...projects].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)).slice(0, 6);
  const doneToday = s.dueToday.filter((t) => st.isDone(t.status)).length;
  const stats = [
    { label: t('Tổng dự án'), value: projects.length, sub: t('{n} yêu thích', { n: projects.filter((p) => p.favorite).length }), icon: FolderKanban, tone: 'text-primary bg-primary/10' },
    { label: t('Experiments đang hoạt động'), value: s.active, sub: t('{n} đang chạy', { n: s.running.length }), icon: FlaskConical, tone: 'text-sky-500 bg-sky-500/10' },
    { label: t('Task hôm nay'), value: s.dueToday.length, sub: t('{n} hoàn thành', { n: doneToday }) + (s.overdue.length ? ' · ' + t('{n} quá hạn', { n: s.overdue.length }) : ''), icon: Target, tone: 'text-emerald-500 bg-emerald-500/10', good: true },
    { label: t("Đang chạy"), value: s.running.length, sub: s.running.slice(0, 2).map((t) => t.title).join(', ') || t("Chưa có"), icon: Play, tone: 'text-amber-500 bg-amber-500/10' },
  ];

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-8 md:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{greeting(now.getHours())} 👋</h1>
            <p className="mt-1 text-sm text-muted-fg">{t("Hôm nay trong nghiên cứu của bạn có gì.")}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-fg">{now.toLocaleDateString(dateLocale(), { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
            <Button variant="primary" onClick={() => setOpen(true)}><Plus size={16} /> {t("Dự án mới")}</Button>
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((c) => (
            <div key={c.label} className="rounded-2xl border bg-card p-5 shadow-card">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-fg">{c.label}</span>
                <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', c.tone)}><c.icon size={16} /></span>
              </div>
              <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{c.value}</div>
              <div className={cn('mt-1 truncate text-xs', c.good && doneToday > 0 ? 'text-done' : 'text-muted-fg')}>{c.sub}</div>
            </div>
          ))}
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">{t("Dự án gần đây")}</h2>
            <Link href="/projects" className="text-sm text-primary hover:underline">{t("Xem tất cả")}</Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {recent.map((p) => <ProjectCard key={p.id} p={p} />)}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t("Task hôm nay")} right={<Link href="/calendar" className="text-sm text-primary hover:underline">{t("Xem lịch")}</Link>}>
            {s.todayList.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-fg">{t("Không có task nào đến hạn hôm nay. Đặt hạn chót cho task để chúng xuất hiện ở đây.")}</p>
            ) : (
              <ul className="-mx-2 divide-y">
                {s.todayList.map((t) => (
                  <li key={t.id} onClick={() => router.push(taskHref(t.projectId, t.id))}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-3 hover:bg-muted/60">
                    <CheckButton done={st.isDone(t.status)} onClick={() => actions.updateTask(t.id, { status: st.isDone(t.status) ? st.todoKey : st.doneKey })} />
                    <div className="min-w-0 flex-1">
                      <div className={cn('truncate text-sm font-medium', st.isDone(t.status) && 'text-muted-fg line-through')}>{t.title}</div>
                      <div className="truncate text-xs text-muted-fg">{t.project.title}</div>
                    </div>
                    <DueChip due={t.dueDate} status={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={t("Experiments đang chạy")} right={<Link href="/experiments" className="text-sm text-primary hover:underline">{t("Xem tất cả")}</Link>}>
            {s.running.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-fg">{t("Chưa có experiment nào đang chạy.")}</p>
            ) : (
              <ul className="-mx-2 divide-y">
                {s.running.slice(0, 6).map((t) => (
                  <li key={t.id} onClick={() => router.push(taskHref(t.projectId, t.id))}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-3 hover:bg-muted/60">
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-running/10 text-running"><Timer size={17} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{t.title}</div>
                      <div className="truncate text-xs text-muted-fg">{t.project.title} · {tr('cập nhật {when}', { when: ago(t.updatedAt) })}</div>
                    </div>
                    <StatusPill status={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      <NewProjectModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
