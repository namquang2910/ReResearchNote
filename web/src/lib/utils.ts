import { dateLocale, t } from './i18n';
import clsx, { type ClassValue } from 'clsx';
import type { Log, Metric } from './types';

export const cn = (...a: ClassValue[]) => clsx(a);

export const PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16'];

export const isBetter = (m: Metric, a: number, b: number) => (m.better === 'low' ? a < b : a > b);

export function bestLog(logs: Log[], m: Metric): Log | null {
  let b: Log | null = null;
  for (const l of logs) if (l.metricId === m.id && (!b || isBetter(m, l.value, b.value))) b = l;
  return b;
}
export function lastLog(logs: Log[], metricId: string): Log | null {
  let b: Log | null = null;
  for (const l of logs) if (l.metricId === metricId && (!b || l.step >= b.step)) b = l;
  return b;
}
export const num = (v: number) => String(+v.toFixed(4));
export const withUnit = (v: number, m?: Metric) => num(v) + (m?.unit ? ` ${m.unit}` : '');
/** 0.873 ± 0.012 (nếu có std) */
export const withStd = (v: number, std: number | null | undefined, m?: Metric) =>
  num(v) + (std != null ? ` ± ${num(std)}` : '') + (m?.unit ? ` ${m.unit}` : '');

/** Tóm tắt một metric trên mọi task của dự án: giá trị tốt nhất, so với baseline, và dãy cột mini. */
export function metricSummary(tasks: { id: string; title: string; createdAt: string; logs: Log[] }[], m: Metric) {
  const rows = tasks
    .map((t) => ({ task: t, log: bestLog(t.logs, m) }))
    .filter((r): r is { task: (typeof tasks)[number]; log: Log } => !!r.log)
    .sort((a, b) => +new Date(a.task.createdAt) - +new Date(b.task.createdAt));
  if (!rows.length) return null;
  const best = rows.reduce((a, b) => (isBetter(m, b.log.value, a.log.value) ? b : a));
  const base = rows[0];
  const delta = base.task.id !== best.task.id ? best.log.value - base.log.value : null;
  return {
    best, base, delta,
    bars: rows.slice(-8).map((r) => ({ id: r.task.id, title: r.task.title, value: r.log.value, std: r.log.std, isBest: r.task.id === best.task.id })),
  };
}

export function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return t("vừa xong");
  if (s < 3600) return t('{n} phút trước', { n: Math.floor(s / 60) });
  if (s < 86400) return t('{n} giờ trước', { n: Math.floor(s / 3600) });
  if (s < 7 * 86400) return t('{n} ngày trước', { n: Math.floor(s / 86400) });
  return new Date(iso).toLocaleDateString(dateLocale());
}

/** Tổ tiên + hậu duệ của một task trong đồ thị phụ thuộc. */
export function chainOf(id: string, tasks: { id: string; dependsOnIds: string[] }[]) {
  const up = new Map(tasks.map((t) => [t.id, t.dependsOnIds]));
  const down = new Map<string, string[]>();
  tasks.forEach((t) => t.dependsOnIds.forEach((d) => down.set(d, [...(down.get(d) ?? []), t.id])));
  const walk = (m: Map<string, string[]>) => {
    const seen = new Set<string>(), st = [id];
    while (st.length) for (const n of m.get(st.pop()!) ?? []) if (!seen.has(n)) { seen.add(n); st.push(n); }
    return seen;
  };
  return new Set([id, ...walk(up), ...walk(down)]);
}

/* ---------- ngày ---------- */
export const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
/** yyyy-mm-dd theo giờ địa phương, dùng cho <input type=date> */
export const toInputDate = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const fromInputDate = (v: string) => (v ? new Date(`${v}T09:00:00`).toISOString() : null);

export type DueTone = 'overdue' | 'today' | 'soon' | 'normal' | 'done';
export function dueInfo(iso: string | null, isDone: boolean): { label: string; tone: DueTone } | null {
  if (!iso) return null;
  const d = new Date(iso), today = startOfDay(new Date());
  const diff = Math.round((startOfDay(d).getTime() - today.getTime()) / 86400000);
  const label = diff === 0 ? t("Hôm nay") : diff === 1 ? t("Ngày mai") : diff === -1 ? t("Hôm qua")
    : d.toLocaleDateString(dateLocale(), { day: '2-digit', month: '2-digit' });
  if (isDone) return { label, tone: 'done' };
  return { label, tone: diff < 0 ? 'overdue' : diff === 0 ? 'today' : diff <= 3 ? 'soon' : 'normal' };
}
export const taskHref = (projectId: string, taskId: string, tab?: string) =>
  `/projects/${projectId}?task=${taskId}${tab ? `&tab=${tab}` : ''}`;
