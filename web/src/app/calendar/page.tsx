'use client';
import { dateLocale, t } from '@/lib/i18n';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import CalendarSyncModal from '@/components/CalendarSync';
import { useActions, useExperiments, useProjects } from '@/lib/hooks';
import { useStatuses } from '@/lib/statuses';
import { cn, fromInputDate, sameDay, taskHref } from '@/lib/utils';
import { Button, Card, Spinner, inputCls } from '@/components/ui';

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export default function CalendarPage() {
  const router = useRouter();
  const tr = t; // `t` bị che bởi biến task trong các callback
  const actions = useActions();
  const st = useStatuses();
  const { data, isLoading } = useExperiments();
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const today = new Date();
  const [syncOpen, setSyncOpen] = useState(false);
  const { data: projects } = useProjects();
  // trạng thái đang bị tắt (lưu lại); dự án được chọn ('' = tất cả)
  const [off, setOff] = useState<Set<string>>(new Set());
  const [projectId, setProjectId] = useState('');
  useEffect(() => { try { setOff(new Set(JSON.parse(localStorage.getItem('calStatusOff') ?? '[]'))); } catch {} }, []);
  const toggleStatus = (key: string) => setOff((s) => {
    const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key);
    try { localStorage.setItem('calStatusOff', JSON.stringify([...n])); } catch {}
    return n;
  });
  const resetStatus = () => { setOff(new Set()); try { localStorage.removeItem('calStatusOff'); } catch {} };
  const visible = (t: { status: string; projectId: string }) => !off.has(t.status) && (!projectId || t.projectId === projectId);
  const inScope = (data ?? []).filter((t) => !projectId || t.projectId === projectId);

  const days = useMemo(() => {
    const first = new Date(cursor);
    const offset = (first.getDay() + 6) % 7; // thứ Hai là cột đầu
    const start = new Date(first); start.setDate(1 - offset);
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [cursor]);

  const byDay = (d: Date) => (data ?? []).filter((t) => t.dueDate && sameDay(new Date(t.dueDate), d) && visible(t));
  const unscheduled = (data ?? []).filter((t) => !t.dueDate && !st.isDone(t.status) && visible(t));
  const shift = (n: number) => setCursor((c) => { const d = new Date(c); d.setMonth(d.getMonth() + n); return d; });

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-6 py-8 md:px-8">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
            <p className="mt-1 text-sm text-muted-fg">{t("Hạn chót của task theo ngày")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" onClick={() => setSyncOpen(true)}><CalendarDays size={14} /> {t("Đồng bộ Apple Calendar")}</Button>
            <Button size="sm" onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); setCursor(d); }}>{t("Hôm nay")}</Button>
            <Button size="sm" onClick={() => shift(-1)}><ChevronLeft size={16} /></Button>
            <span className="w-36 text-center text-sm font-semibold capitalize">
              {cursor.toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' })}
            </span>
            <Button size="sm" onClick={() => shift(1)}><ChevronRight size={16} /></Button>
          </div>
        </header>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-muted-fg">{t("Lọc")}</span>
          {st.list.map((s) => {
            const n = inScope.filter((t) => t.status === s.key && t.dueDate).length;
            const on = !off.has(s.key);
            return (
              <button key={s.key} onClick={() => toggleStatus(s.key)} title={on ? t("Bấm để ẩn") : t("Bấm để hiện")}
                className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition',
                  on ? 'bg-card hover:bg-muted' : 'border-dashed text-muted-fg line-through opacity-60 hover:opacity-100')}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: on ? s.color : 'transparent', border: `2px solid ${s.color}` }} />
                {s.name}
                <span className="text-muted-fg">{n}</span>
              </button>
            );
          })}
          {off.size > 0 && <button onClick={resetStatus} className="text-xs font-medium text-primary hover:underline">{t("Hiện tất cả")}</button>}
          <span className="flex-1" />
          <select className={cn(inputCls, 'h-9 w-52')} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">{t("Mọi dự án")}</option>
            {projects?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>

        {isLoading ? <div className="flex justify-center py-16"><Spinner /></div> : (
          <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
            <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
              <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-xs font-semibold text-muted-fg">
                {WEEKDAYS.map((w) => <div key={w} className="py-2.5">{t(w)}</div>)}
              </div>
              <div className="grid grid-cols-7">
                {days.map((d, i) => {
                  const inMonth = d.getMonth() === cursor.getMonth();
                  const items = byDay(d);
                  const isToday = sameDay(d, today);
                  return (
                    <div key={i} className={cn('min-h-[104px] border-b border-r p-1.5 [&:nth-child(7n)]:border-r-0', !inMonth && 'bg-muted/30')}>
                      <div className={cn('mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                        isToday ? 'bg-primary text-primary-fg' : inMonth ? '' : 'text-muted-fg/60')}>{d.getDate()}</div>
                      <div className="space-y-1">
                        {items.slice(0, 3).map((t) => (
                          <button key={t.id} onClick={() => router.push(taskHref(t.projectId, t.id))} title={`${t.project.title} › ${t.title}`}
                            className="flex w-full items-center gap-1.5 truncate rounded-md px-1.5 py-1 text-left text-[11px] font-medium hover:opacity-80"
                            style={{ background: st.meta(t.status).color + '22', color: st.meta(t.status).color }}>
                            <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: t.project.color }} />
                            <span className={cn('truncate', st.isDone(t.status) && 'line-through')}>{t.title}</span>
                          </button>
                        ))}
                        {items.length > 3 && <div className="px-1.5 text-[11px] text-muted-fg">{t('+{n} nữa', { n: items.length - 3 })}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <Card title={t('Chưa đặt hạn ({n})', { n: unscheduled.length })} className="h-fit">
              {unscheduled.length === 0 ? <p className="text-sm text-muted-fg">{t("Mọi task chưa xong đều đã có hạn.")}</p> : (
                <ul className="space-y-3">
                  {unscheduled.map((t) => (
                    <li key={t.id}>
                      <button onClick={() => router.push(taskHref(t.projectId, t.id))} className="block w-full truncate text-left text-sm font-medium hover:underline">{t.title}</button>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="h-2 w-2 flex-none rounded-sm" style={{ background: t.project.color }} />
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-fg">{t.project.title}</span>
                        <input type="date" aria-label={tr("Đặt hạn")} className={cn(inputCls, 'h-8 w-36 py-0 text-xs')}
                          onChange={(e) => e.target.value && actions.updateTask(t.id, { dueDate: fromInputDate(e.target.value) })} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </div>
      <CalendarSyncModal open={syncOpen} onClose={() => setSyncOpen(false)} />
    </div>
  );
}
