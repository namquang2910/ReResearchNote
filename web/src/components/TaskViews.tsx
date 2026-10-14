'use client';
import { dateLocale, t } from '@/lib/i18n';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarDays, ChevronDown, Eye, EyeOff, KanbanSquare, Link2, List, Table2 } from 'lucide-react';
import type { Label, Log, Metric, Status } from '@/lib/types';
import { useStatuses } from '@/lib/statuses';
import { bestLog, cn, dueInfo, lastLog, num } from '@/lib/utils';
import { CheckButton, LabelChip, Sparkline, StatusPicker, StatusPill } from './task-bits';

/** Dạng chung cho task của một dự án hoặc của mọi dự án. */
export interface VTask {
  id: string; projectId: string; title: string; status: Status; dueDate: string | null; createdAt: string;
  labels: Label[]; depCount: number; logs: Log[]; metrics: Metric[];
  project?: { id: string; title: string; color: string };
}
export type ViewMode = 'list' | 'board' | 'table';

export function useViewMode(): [ViewMode, (v: ViewMode) => void] {
  const [v, setV] = useState<ViewMode>('list');
  useEffect(() => { try { const s = localStorage.getItem('taskView'); if (s === 'list' || s === 'board' || s === 'table') setV(s); } catch {} }, []);
  return [v, (m) => { setV(m); try { localStorage.setItem('taskView', m); } catch {} }];
}

/** Bật/tắt ẩn task hoàn thành — nhớ lựa chọn. */
export function useHideDone(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(false);
  useEffect(() => { try { setV(localStorage.getItem('hideDone') === '1'); } catch {} }, []);
  return [v, (x) => { setV(x); try { localStorage.setItem('hideDone', x ? '1' : '0'); } catch {} }];
}

export function HideDoneToggle({ value, onChange, hidden }: { value: boolean; onChange: (v: boolean) => void; hidden: number }) {
  return (
    <button onClick={() => onChange(!value)} title={value ? t("Đang ẩn task hoàn thành — bấm để hiện") : t("Ẩn các task đã hoàn thành")}
      className={cn('inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition',
        value ? 'border-primary bg-soft text-primary' : 'bg-card text-muted-fg hover:bg-muted hover:text-fg')}>
      {value ? <EyeOff size={14} /> : <Eye size={14} />}
      {value ? t('Đang ẩn task hoàn thành') + (hidden ? ` (${hidden})` : '') : t('Ẩn task hoàn thành')}
    </button>
  );
}

export function ViewSwitcher({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const items: { v: ViewMode; label: string; icon: typeof List }[] = [
    { v: 'list', label: t("Danh sách"), icon: List },
    { v: 'board', label: 'Board', icon: KanbanSquare },
    { v: 'table', label: 'Table', icon: Table2 },
  ];
  return (
    <div className="inline-flex rounded-lg bg-muted p-0.5">
      {items.map((i) => (
        <button key={i.v} onClick={() => onChange(i.v)}
          className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition',
            value === i.v ? 'bg-card text-fg shadow-card' : 'text-muted-fg hover:text-fg')}>
          <i.icon size={14} />{i.label}
        </button>
      ))}
    </div>
  );
}

export function DueChip({ due, status }: { due: string | null; status: Status }) {
  const { isDone } = useStatuses();
  const d = dueInfo(due, isDone(status));
  if (!d) return null;
  const tone = { overdue: 'bg-blocked/10 text-blocked', today: 'bg-amber-500/15 text-amber-600', soon: 'bg-primary/10 text-primary', normal: 'bg-muted text-muted-fg', done: 'bg-muted text-muted-fg' }[d.tone];
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium', tone)}><CalendarDays size={11} />{d.label}</span>;
}

const ProjectDot = ({ p }: { p: NonNullable<VTask['project']> }) => (
  <span className="inline-flex max-w-[160px] items-center gap-1.5 text-xs text-muted-fg">
    <span className="h-2 w-2 flex-none rounded-sm" style={{ background: p.color }} /><span className="truncate">{p.title}</span>
  </span>
);

function lastMetric(t: VTask) {
  const m = t.metrics.find((x) => lastLog(t.logs, x.id));
  if (!m) return null;
  return { m, last: lastLog(t.logs, m.id)!, series: t.logs.filter((l) => l.metricId === m.id).map((l) => l.value) };
}

interface Props {
  tasks: VTask[];
  view: ViewMode;
  selectedId?: string | null;
  showProject?: boolean;
  /** cột metric riêng cho dự án (theo thứ tự); bỏ trống ở trang toàn cục */
  metricCols?: Metric[];
  onOpen: (t: VTask) => void;
  onStatus: (t: VTask, s: Status) => void;
}

export default function TaskViews(p: Props) {
  if (p.tasks.length === 0) return null;
  if (p.view === 'board') return <Board {...p} />;
  if (p.view === 'table') return <TableView {...p} />;
  return <ListView {...p} />;
}

/* ---------------- Danh sách ---------------- */
function ListView({ tasks, selectedId, showProject, onOpen, onStatus }: Props) {
  const st = useStatuses();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  return (
    <div className="space-y-6">
      {st.grouped.map((def) => {
        const s = def.key;
        const list = tasks.filter((t) => t.status === s);
        if (!list.length) return null;
        return (
          <section key={s}>
            <button onClick={() => setCollapsed((c) => ({ ...c, [s]: !c[s] }))} className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <ChevronDown size={16} className={cn('text-muted-fg transition', collapsed[s] && '-rotate-90')} />
              <span className="h-2 w-2 rounded-full" style={{ background: def.color }} />
              {def.name}
              <span className="rounded-md bg-muted px-1.5 text-xs font-medium text-muted-fg">{list.length}</span>
            </button>
            {!collapsed[s] && (
              <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
                {list.map((t) => {
                  const lm = lastMetric(t);
                  return (
                    <div key={t.id} onClick={() => onOpen(t)}
                      className={cn('flex cursor-pointer items-center gap-3 border-b px-4 py-3 transition last:border-b-0 hover:bg-muted/60', t.id === selectedId && 'bg-soft')}>
                      <CheckButton done={st.isDone(t.status)} onClick={() => onStatus(t, st.isDone(t.status) ? st.todoKey : st.doneKey)} />
                      <div className="min-w-0 flex-1">
                        <div className={cn('truncate text-sm font-medium', st.isDone(t.status) && 'text-muted-fg line-through')}>{t.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {showProject && t.project && <ProjectDot p={t.project} />}
                          {t.labels.map((l) => <LabelChip key={l.id} label={l} />)}
                          {t.depCount > 0 && <span className="inline-flex items-center gap-1 text-xs text-muted-fg"><Link2 size={12} />{t.depCount}</span>}
                        </div>
                      </div>
                      <DueChip due={t.dueDate} status={t.status} />
                      {lm && (
                        <div className="hidden items-center gap-2 sm:flex">
                          <Sparkline values={lm.series} />
                          <div className="text-right">
                            <div className="text-xs text-muted-fg">{lm.m.name}</div>
                            <div className="text-sm font-semibold tabular-nums">{num(lm.last.value)}</div>
                          </div>
                        </div>
                      )}
                      <StatusPicker status={t.status} onChange={(st) => onStatus(t, st)} />
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ---------------- Board ngang (kanban) ---------------- */
function Board({ tasks, selectedId, showProject, onOpen, onStatus }: Props) {
  const st = useStatuses();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Status | null>(null);
  return (
    <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-4">
      {st.list.map((def) => {
        const s = def.key;
        const list = tasks.filter((t) => t.status === s);
        return (
          <div key={s}
            onDragOver={(e) => { e.preventDefault(); setOver(s); }}
            onDragLeave={() => setOver((o) => (o === s ? null : o))}
            onDrop={() => {
              const t = tasks.find((x) => x.id === dragId);
              setOver(null); setDragId(null);
              if (t && t.status !== s) onStatus(t, s);
            }}
            className={cn('flex w-[290px] flex-none flex-col rounded-2xl border bg-muted/50 p-2.5 transition', over === s && 'border-primary bg-soft')}>
            <div className="mb-2.5 flex items-center gap-2 px-1.5 pt-1 text-sm font-semibold">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: def.color }} />
              {def.name}
              <span className="rounded-md bg-card px-1.5 text-xs font-medium text-muted-fg">{list.length}</span>
            </div>
            <div className="flex min-h-24 flex-col gap-2.5">
              {list.map((t) => {
                const lm = lastMetric(t);
                return (
                  <div key={t.id} draggable onDragStart={() => setDragId(t.id)} onDragEnd={() => { setDragId(null); setOver(null); }}
                    onClick={() => onOpen(t)}
                    className={cn('cursor-pointer rounded-xl border bg-card p-3 shadow-card transition hover:border-primary/60',
                      dragId === t.id && 'opacity-40', t.id === selectedId && 'border-primary ring-2 ring-primary/30')}>
                    {showProject && t.project && <div className="mb-1.5"><ProjectDot p={t.project} /></div>}
                    <div className={cn('text-sm font-medium leading-snug', st.isDone(t.status) && 'text-muted-fg line-through')}>{t.title}</div>
                    {t.labels.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{t.labels.map((l) => <LabelChip key={l.id} label={l} />)}</div>}
                    <div className="mt-3 flex items-center gap-2">
                      <DueChip due={t.dueDate} status={t.status} />
                      {t.depCount > 0 && <span className="inline-flex items-center gap-1 text-xs text-muted-fg"><Link2 size={12} />{t.depCount}</span>}
                      {lm && (
                        <span className="ml-auto flex items-center gap-1.5">
                          <Sparkline values={lm.series} w={44} h={18} />
                          <span className="text-xs font-semibold tabular-nums">{num(lm.last.value)}</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {list.length === 0 && <div className="rounded-xl border border-dashed py-6 text-center text-xs text-muted-fg">{t("Kéo task vào đây")}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Table ---------------- */
type SortKey = 'title' | 'project' | 'status' | 'due' | 'deps' | 'created' | `m:${string}` | 'metric';

function TableView({ tasks, selectedId, showProject, metricCols, onOpen, onStatus }: Props) {
  const st = useStatuses();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'created', dir: 1 });

  const value = (t: VTask, key: SortKey): number | string => {
    switch (key) {
      case 'title': return t.title.toLowerCase();
      case 'project': return t.project?.title.toLowerCase() ?? '';
      case 'status': return st.indexOf(t.status);
      case 'due': return t.dueDate ? new Date(t.dueDate).getTime() : Infinity;
      case 'deps': return t.depCount;
      case 'created': return new Date(t.createdAt).getTime();
      case 'metric': return lastMetric(t)?.last.value ?? -Infinity;
      default: { const m = metricCols?.find((x) => `m:${x.id}` === key); const l = m && bestLog(t.logs, m); return l ? l.value : -Infinity; }
    }
  };
  const rows = useMemo(() => [...tasks].sort((a, b) => {
    const x = value(a, sort.key), y = value(b, sort.key);
    return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [tasks, sort, metricCols]);

  const Th = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={cn('whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold text-muted-fg', className)}>
      <button onClick={() => setSort((s) => (s.key === k ? { key: k, dir: (-s.dir as 1 | -1) } : { key: k, dir: 1 }))}
        className="inline-flex items-center gap-1 hover:text-fg">
        {children}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );

  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-card">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="w-10 px-3" />
            <Th k="title">Task</Th>
            {showProject && <Th k="project">{t("Dự án")}</Th>}
            <Th k="status">{t("Trạng thái")}</Th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-fg">{t("Nhãn")}</th>
            <Th k="due">{t("Hạn")}</Th>
            <Th k="deps">{t("Phụ thuộc")}</Th>
            {metricCols ? metricCols.map((m) => <Th key={m.id} k={`m:${m.id}`} className="text-right">{m.name} {m.better === 'low' ? '↓' : '↑'}</Th>)
              : <Th k="metric" className="text-right">{t("Metric gần nhất")}</Th>}
            <Th k="created">{t("Tạo")}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const lm = lastMetric(t);
            return (
              <tr key={t.id} onClick={() => onOpen(t)} className={cn('cursor-pointer border-b last:border-b-0 hover:bg-muted/50', t.id === selectedId && 'bg-soft')}>
                <td className="px-3 py-2.5"><CheckButton done={st.isDone(t.status)} onClick={() => onStatus(t, st.isDone(t.status) ? st.todoKey : st.doneKey)} /></td>
                <td className={cn('max-w-[320px] truncate px-3 py-2.5 font-medium', st.isDone(t.status) && 'text-muted-fg line-through')}>{t.title}</td>
                {showProject && <td className="px-3 py-2.5">{t.project && <ProjectDot p={t.project} />}</td>}
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <StatusPicker status={t.status} onChange={(s) => onStatus(t, s)} />
                </td>
                <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1">{t.labels.map((l) => <LabelChip key={l.id} label={l} />)}</div></td>
                <td className="px-3 py-2.5"><DueChip due={t.dueDate} status={t.status} /></td>
                <td className="px-3 py-2.5 tabular-nums text-muted-fg">{t.depCount || '—'}</td>
                {metricCols ? metricCols.map((m) => {
                  const l = bestLog(t.logs, m);
                  return (
                    <td key={m.id} className={cn('whitespace-nowrap px-3 py-2.5 text-right tabular-nums', l ? 'font-medium' : 'text-muted-fg')}>
                      {l ? <>{num(l.value)}{l.std != null && <span className="font-normal text-muted-fg"> ± {num(l.std)}</span>}</> : '—'}
                    </td>
                  );
                }) : (
                  <td className="px-3 py-2.5 text-right tabular-nums">{lm ? <><span className="mr-1.5 text-xs text-muted-fg">{lm.m.name}</span><b>{num(lm.last.value)}</b></> : <span className="text-muted-fg">—</span>}</td>
                )}
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-fg">{new Date(t.createdAt).toLocaleDateString(dateLocale())}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export { StatusPill };
