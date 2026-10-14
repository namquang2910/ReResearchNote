'use client';
import { t } from '@/lib/i18n';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ErrorBar, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3 } from 'lucide-react';
import { useProjectCtx } from '@/lib/hooks';
import { useStatuses } from '@/lib/statuses';
import { PALETTE, bestLog, cn, isBetter, num, withStd, withUnit } from '@/lib/utils';
import { Card, Empty, Segmented } from '@/components/ui';

const tip = { borderRadius: 10, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', fontSize: 12 };
const axis = { fontSize: 11, fill: 'hsl(var(--muted-fg))' };

export default function AnalyticsPage() {
  const { project, openTask } = useProjectCtx();
  const { tasks, metrics } = project;
  const st = useStatuses();
  const [metricId, setMetricId] = useState(metrics[0]?.id ?? '');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const m = metrics.find((x) => x.id === metricId) ?? metrics[0];

  const colorOf = useMemo(() => new Map(tasks.map((t, i) => [t.id, PALETTE[i % PALETTE.length]])), [tasks]);
  const statusData = st.grouped.map((s) => ({ key: s.key, name: s.name, value: tasks.filter((t) => t.status === s.key).length, color: s.color }));

  const series = useMemo(() => (m ? tasks.filter((t) => t.logs.some((l) => l.metricId === m.id)) : []), [tasks, m]);
  const lineData = useMemo(() => {
    if (!m) return [];
    const steps = new Map<number, Record<string, number>>();
    series.forEach((t) => t.logs.filter((l) => l.metricId === m.id).forEach((l) => {
      steps.set(l.step, { ...(steps.get(l.step) ?? {}), [t.id]: l.value, ...(l.std ? { [`${t.id}__e`]: l.std } : {}) });
    }));
    return [...steps.entries()].sort((a, b) => a[0] - b[0]).map(([step, v]) => ({ step, ...v }));
  }, [series, m]);

  const bars = useMemo(() => {
    if (!m) return [];
    return series.map((t) => { const l = bestLog(t.logs, m)!; return { id: t.id, name: t.title, value: l.value, std: l.std && l.std > 0 ? l.std : undefined }; })
      .sort((a, b) => (isBetter(m, a.value, b.value) ? -1 : 1));
  }, [series, m]);

  if (!tasks.length) return <div className="p-8"><Empty icon={<BarChart3 size={24} />} title={t("Chưa có dữ liệu")} hint={t("Thêm task và ghi log metric để xem biểu đồ.")} /></div>;

  const bestPer = metrics.map((x) => {
    let b: number | null = null;
    tasks.forEach((t) => { const l = bestLog(t.logs, x); if (l && (b === null || isBetter(x, l.value, b))) b = l.value; });
    return b;
  });

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-6 py-6 md:px-8">
      <div className="grid gap-5 lg:grid-cols-5">
        <Card title={t("Trạng thái task")} className="lg:col-span-2">
          <div className="flex items-center gap-6">
            <div className="relative h-44 w-44 flex-none">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={statusData} dataKey="value" innerRadius={58} outerRadius={82} isAnimationActive={false} paddingAngle={statusData.filter((d) => d.value).length > 1 ? 3 : 0} stroke="none">
                    {statusData.map((d) => <Cell key={d.key} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tip} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-semibold tabular-nums">{tasks.length}</span>
                <span className="text-xs text-muted-fg">task</span>
              </div>
            </div>
            <ul className="space-y-2.5 text-sm">
              {statusData.map((d) => (
                <li key={d.key} className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                  <span className="w-24 text-muted-fg">{d.name}</span><b className="tabular-nums">{d.value}</b>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card className="lg:col-span-3" title={m ? t('So sánh tốt nhất — {name}', { name: m.name }) : t('So sánh')}
          right={m && <span className="text-xs text-muted-fg">{m.better === 'low' ? t("thấp hơn là tốt hơn") : t("cao hơn là tốt hơn")}</span>}>
          {bars.length ? (
            <div style={{ height: Math.max(170, bars.length * 38) }}>
              <ResponsiveContainer>
                <BarChart data={bars} layout="vertical" margin={{ left: 8, right: 36, top: 0, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={axis} tickLine={false} axisLine={false} domain={[0, 'auto']} />
                  <YAxis type="category" dataKey="name" width={150} tick={axis} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tip} cursor={{ fill: 'hsl(var(--muted))' }} formatter={(v: number) => [m ? withUnit(v, m) : v, m?.name]} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18} isAnimationActive={false}
                    label={{ position: 'right', fontSize: 11, fill: 'hsl(var(--fg))', formatter: (v: number) => num(v) }}>
                    {bars.map((b) => <Cell key={b.id} fill={colorOf.get(b.id)} />)}
                    <ErrorBar dataKey="std" direction="x" width={5} strokeWidth={1.5} stroke="hsl(var(--fg))" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="py-10 text-center text-sm text-muted-fg">{t("Chưa có log nào cho metric này.")}</p>}
        </Card>
      </div>

      {m && (
        <Card title={t("Diễn biến theo step")}
          right={<Segmented value={m.id} onChange={setMetricId} options={metrics.map((x) => ({ value: x.id, label: x.name }))} />}>
          {lineData.length ? (
            <>
              <div className="h-80">
                <ResponsiveContainer>
                  <LineChart data={lineData} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="step" tick={axis} tickLine={false} stroke="hsl(var(--border))" label={{ value: 'step', position: 'insideBottomRight', offset: -4, fontSize: 11, fill: 'hsl(var(--muted-fg))' }} />
                    <YAxis tick={axis} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                    <Tooltip contentStyle={tip} labelFormatter={(s) => `step ${s}`}
                      formatter={(v: number, id: string) => [withUnit(v, m), tasks.find((t) => t.id === id)?.title ?? id]} />
                    {series.filter((t) => !hidden.has(t.id)).map((t) => (
                      <Line key={t.id} dataKey={t.id} type="monotone" stroke={colorOf.get(t.id)} strokeWidth={2.4} connectNulls
                        dot={{ r: 3, strokeWidth: 0, fill: colorOf.get(t.id) }} activeDot={{ r: 5 }} isAnimationActive={false}>
                        <ErrorBar dataKey={`${t.id}__e`} width={4} strokeWidth={1.3} stroke={colorOf.get(t.id)} />
                      </Line>
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {series.map((t) => (
                  <button key={t.id}
                    onClick={() => setHidden((h) => { const n = new Set(h); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n; })}
                    className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition hover:bg-muted', hidden.has(t.id) && 'opacity-40')}>
                    <span className="h-2 w-2 rounded-full" style={{ background: colorOf.get(t.id) }} />{t.title}
                  </button>
                ))}
              </div>
            </>
          ) : <p className="py-12 text-center text-sm text-muted-fg">{t('Chưa có log nào cho “{name}”. Mở một task, vào tab Metrics và ghi giá trị.', { name: m.name })}</p>}
        </Card>
      )}

      {metrics.length > 0 && (
        <Card title={t("Bảng so sánh (giá trị tốt nhất)")}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-fg">
                  <th className="pb-2 pr-4 font-medium">Task</th>
                  {metrics.map((x) => <th key={x.id} className="pb-2 pr-4 font-medium">{x.name} {x.better === 'low' ? '↓' : '↑'}</th>)}
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id} className="cursor-pointer border-t hover:bg-muted/60" onClick={() => openTask(t.id, 'metrics')}>
                    <td className="py-2.5 pr-4 font-medium">
                      <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: st.meta(t.status).color }} />{t.title}
                    </td>
                    {metrics.map((x, i) => {
                      const l = bestLog(t.logs, x);
                      const isBest = l && l.value === bestPer[i];
                      return <td key={x.id} className={cn('py-2.5 pr-4 tabular-nums', isBest ? 'font-semibold text-done' : l ? '' : 'text-muted-fg')}>{l ? <>{num(l.value)}{l.std != null && <span className="font-normal text-muted-fg"> ± {num(l.std)}</span>}</> : '—'}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
