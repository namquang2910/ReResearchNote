'use client';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { dateLocale, t } from '@/lib/i18n';

export interface HeatDay { date: string; value: number }

/** Lưới đóng góp kiểu GitHub: mỗi cột một tuần (Thứ Hai ở trên), ô đậm dần theo mức hoạt động. */
export default function Heatmap({ days, color = 'hsl(var(--primary))', cell = 12, gap = 3, showLabels = true, onHover, selected }: {
  days: HeatDay[]; color?: string; cell?: number; gap?: number; showLabels?: boolean;
  onHover?: (d: HeatDay | null) => void; selected?: string | null;
}) {
  const { weeks, months, max } = useMemo(() => {
    const weeks: (HeatDay | null)[][] = [];
    let col: (HeatDay | null)[] = [];
    const months: { col: number; label: string }[] = [];
    let lastMonth = -1;
    days.forEach((d, i) => {
      const dt = new Date(d.date + 'T00:00:00');
      const wd = (dt.getDay() + 6) % 7; // Thứ Hai = 0
      if (i === 0) for (let k = 0; k < wd; k++) col.push(null);
      if (wd === 0 && col.length) { weeks.push(col); col = []; }
      col.push(d);
      if (dt.getMonth() !== lastMonth && (wd < 4 || i === 0)) {
        lastMonth = dt.getMonth();
        months.push({ col: weeks.length, label: dt.toLocaleDateString(dateLocale(), { month: 'short' }) });
      }
    });
    if (col.length) weeks.push(col);
    return { weeks, months, max: Math.max(1, ...days.map((d) => d.value)) };
  }, [days]);

  const level = (v: number) => (v <= 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)));
  const bg = (l: number) => (l === 0 ? 'hsl(var(--muted))' : `color-mix(in srgb, ${color} ${[0, 28, 50, 75, 100][l]}%, transparent)`);
  const step = cell + gap;
  const labelW = showLabels ? 30 : 0;

  return (
    <div className="overflow-x-auto pb-1">
      <div style={{ width: labelW + weeks.length * step }} className="relative">
        {showLabels && (
          <div className="relative h-5 text-[11px] text-muted-fg" style={{ marginLeft: labelW }}>
            {months.map((m, i) => <span key={i} className="absolute" style={{ left: m.col * step }}>{m.label}</span>)}
          </div>
        )}
        <div className="flex">
          {showLabels && (
            <div className="flex flex-col text-[10px] text-muted-fg" style={{ width: labelW, gap }}>
              {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((w, i) => (
                <span key={w} style={{ height: cell, lineHeight: `${cell}px` }}>{i % 2 === 0 ? t(w) : ''}</span>
              ))}
            </div>
          )}
          <div className="flex" style={{ gap }}>
            {weeks.map((w, ci) => (
              <div key={ci} className="flex flex-col" style={{ gap }}>
                {Array.from({ length: 7 }, (_, r) => w[r] ?? null).map((d, r) => d ? (
                  <div key={r} onMouseEnter={() => onHover?.(d)} onMouseLeave={() => onHover?.(null)}
                    title={`${d.value} · ${d.date}`}
                    className={cn('rounded-[3px] transition', selected === d.date && 'ring-2 ring-fg/60')}
                    style={{ width: cell, height: cell, background: bg(level(d.value)) }} />
                ) : <div key={r} style={{ width: cell, height: cell }} />)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function HeatLegend({ color = 'hsl(var(--primary))' }: { color?: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-fg">
      {t('Ít')}
      {[0, 28, 50, 75, 100].map((p) => (
        <span key={p} className="h-3 w-3 rounded-[3px]" style={{ background: p === 0 ? 'hsl(var(--muted))' : `color-mix(in srgb, ${color} ${p}%, transparent)` }} />
      ))}
      {t('Nhiều')}
    </div>
  );
}
