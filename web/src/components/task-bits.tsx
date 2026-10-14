'use client';
import { t } from '@/lib/i18n';
import { Ban, Check, Circle, Play } from 'lucide-react';
import type { Label, Status } from '@/lib/types';
import { useStatuses } from '@/lib/statuses';
import { cn } from '@/lib/utils';
import { Popover } from './ui';

export function StatusIcon({ status, size = 16 }: { status: Status; size?: number }) {
  const { meta } = useStatuses();
  const m = meta(status);
  const style = { color: m.color };
  if (m.kind === 'done') return <Check size={size} style={style} strokeWidth={3} />;
  if (m.kind === 'running') return <Play size={size - 2} style={style} className="fill-current" />;
  if (m.kind === 'blocked') return <Ban size={size} style={style} />;
  return <Circle size={size} style={style} />;
}

export function StatusPill({ status, className }: { status: Status; className?: string }) {
  const { meta } = useStatuses();
  const s = meta(status);
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium', className)}
      style={{ background: s.color + '1f', color: s.color }}>
      <span className="relative flex h-1.5 w-1.5">
        {s.kind === 'running' && <span className="absolute inset-0 animate-ring rounded-full" style={{ background: s.color }} />}
        <span className="relative h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
      </span>
      {s.name}
    </span>
  );
}

export function StatusPicker({ status, onChange }: { status: Status; onChange: (s: Status) => void }) {
  const { list } = useStatuses();
  return (
    <Popover trigger={() => <button className="rounded-full transition hover:brightness-95"><StatusPill status={status} /></button>}>
      {(close) => list.map((s) => (
        <button key={s.key} onClick={() => { onChange(s.key); close(); }}
          className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted', s.key === status && 'bg-muted')}>
          <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
          {s.name}
        </button>
      ))}
    </Popover>
  );
}

export function LabelChip({ label, onClick, active }: { label: Label; onClick?: () => void; active?: boolean }) {
  const Tag: any = onClick ? 'button' : 'span';
  return (
    <Tag onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium transition', onClick && 'hover:opacity-80', active === false && 'opacity-45')}
      style={{ background: label.color + '22', color: label.color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: label.color }} />
      {label.name}
    </Tag>
  );
}

/** nút tròn đánh dấu hoàn thành */
export function CheckButton({ done, onClick }: { done: boolean; onClick: () => void }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} title={done ? t("Bỏ hoàn thành") : t("Đánh dấu hoàn thành")}
      className={cn('flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 transition',
        done ? 'border-done bg-done text-white' : 'border-muted-fg/40 text-transparent hover:border-done hover:text-done/60')}>
      <Check size={12} strokeWidth={3.5} />
    </button>
  );
}

/** sparkline nhỏ cho một chuỗi giá trị */
export function Sparkline({ values, color = '#6366f1', w = 64, h = 22 }: { values: number[]; color?: string; w?: number; h?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (w - 2) + 1},${h - 2 - ((v - min) / span) * (h - 4)}`).join(' ');
  return (
    <svg width={w} height={h} className="flex-none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
