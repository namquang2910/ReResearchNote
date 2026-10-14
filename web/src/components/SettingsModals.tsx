'use client';
import { t } from '@/lib/i18n';
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import type { LibraryItem } from '@/lib/types';
import { KIND_LABEL, type StatusDef, type StatusKind } from '@/lib/statuses';
import { PALETTE, cn } from '@/lib/utils';
import { Button, Modal, Segmented, inputCls } from './ui';

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div>
    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-fg">{label}</label>
    {children}
    {hint && <p className="mt-1.5 text-xs text-muted-fg">{hint}</p>}
  </div>
);

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PALETTE.map((c) => (
        <button key={c} type="button" onClick={() => onChange(c)} aria-label={c}
          className={cn('flex h-8 w-8 items-center justify-center rounded-lg text-white transition hover:scale-110', value.toLowerCase() === c && 'ring-2 ring-offset-2 ring-offset-card')}
          style={{ background: c, ['--tw-ring-color' as string]: c }}>
          {value.toLowerCase() === c && <Check size={15} strokeWidth={3} />}
        </button>
      ))}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} title={t("Màu tùy chọn")}
        className="h-8 w-10 cursor-pointer rounded-lg border bg-transparent p-0.5" />
    </div>
  );
}

function Footer({ onClose, onSave, disabled, label = t("Lưu") }: { onClose: () => void; onSave: () => void; disabled?: boolean; label?: string }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button onClick={onClose}>{t("Hủy")}</Button>
      <Button variant="primary" onClick={onSave} disabled={disabled}>{label}</Button>
    </div>
  );
}

/** Gợi ý từ thư viện: bấm để điền sẵn vào form */
function LibraryHints({ items, onPick, render }: { items: LibraryItem[]; onPick: (i: LibraryItem) => void; render?: (i: LibraryItem) => React.ReactNode }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-fg">{t("Dùng lại từ thư viện")}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((i) => (
          <button key={i.id} type="button" onClick={() => onPick(i)}
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition hover:border-primary hover:bg-soft">
            {render ? render(i) : i.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Metric ---------------- */
export interface MetricValue { name: string; unit: string; better: 'high' | 'low' }
const UNITS = ['%', 's', 'ms', 'h', 'MB', 'GB', 'epoch'];

export function MetricModal({ open, onClose, initial, library, taken, onSave, title }: {
  open: boolean; onClose: () => void; initial?: MetricValue; library?: LibraryItem[]; taken: string[];
  onSave: (v: MetricValue) => Promise<unknown> | void; title: string;
}) {
  const [v, setV] = useState<MetricValue>({ name: '', unit: '', better: 'high' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setV(initial ?? { name: '', unit: '', better: 'high' }); }, [open, initial]);
  const dup = !!v.name.trim() && taken.some((n) => n.toLowerCase() === v.name.trim().toLowerCase());
  const save = async () => {
    if (!v.name.trim() || dup) return;
    setBusy(true);
    await onSave({ ...v, name: v.name.trim(), unit: v.unit.trim() });
    setBusy(false);
  };
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <LibraryHints items={library ?? []} onPick={(i) => setV({ name: i.name, unit: i.unit ?? '', better: (i.better as 'high' | 'low') ?? 'high' })}
          render={(i) => <>{i.name}{i.unit ? <span className="text-muted-fg">({i.unit})</span> : null}</>} />
        <Field label={t("Tên metric")} hint={dup ? undefined : undefined}>
          <input autoFocus className={inputCls} placeholder="vd: Macro F1, Loss, Training time" value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && save()} />
          {dup && <p className="mt-1.5 text-xs text-blocked">{t("Dự án đã có metric tên này.")}</p>}
        </Field>
        <Field label={t("Đơn vị (tuỳ chọn)")}>
          <input className={inputCls} placeholder="vd: %, s, h" value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value })} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {UNITS.map((u) => (
              <button key={u} type="button" onClick={() => setV({ ...v, unit: u })}
                className={cn('rounded-md border px-2 py-0.5 text-xs transition hover:bg-muted', v.unit === u && 'border-primary bg-soft text-primary')}>{u}</button>
            ))}
          </div>
        </Field>
        <Field label={t("Giá trị nào tốt hơn?")} hint={t("Dùng để tô màu giá trị tốt nhất và xếp hạng ở tab Phân tích.")}>
          <Segmented value={v.better} onChange={(better) => setV({ ...v, better })}
            options={[{ value: 'high', label: t("↑ Càng cao càng tốt (F1, Accuracy)") }, { value: 'low', label: t("↓ Càng thấp càng tốt (Loss, Time)") }]} />
        </Field>
        <Footer onClose={onClose} onSave={save} disabled={!v.name.trim() || dup || busy} label={initial ? t("Lưu thay đổi") : t("Thêm metric")} />
      </div>
    </Modal>
  );
}

/* ---------------- Nhãn ---------------- */
export interface LabelValue { name: string; color: string }

export function LabelModal({ open, onClose, initial, library, taken, onSave, title }: {
  open: boolean; onClose: () => void; initial?: LabelValue; library?: LibraryItem[]; taken: string[];
  onSave: (v: LabelValue) => Promise<unknown> | void; title: string;
}) {
  const [v, setV] = useState<LabelValue>({ name: '', color: PALETTE[0] });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setV(initial ?? { name: '', color: PALETTE[Math.floor(Math.random() * PALETTE.length)] }); }, [open, initial]);
  const dup = !!v.name.trim() && taken.some((n) => n.toLowerCase() === v.name.trim().toLowerCase());
  const save = async () => {
    if (!v.name.trim() || dup) return;
    setBusy(true);
    await onSave({ ...v, name: v.name.trim() });
    setBusy(false);
  };
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <LibraryHints items={library ?? []} onPick={(i) => setV({ name: i.name, color: i.color ?? PALETTE[0] })}
          render={(i) => <><span className="h-2 w-2 rounded-full" style={{ background: i.color ?? '#999' }} />{i.name}</>} />
        <Field label={t("Tên nhãn")}>
          <input autoFocus className={inputCls} placeholder="vd: ablation, baseline, paper" value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && save()} />
          {dup && <p className="mt-1.5 text-xs text-blocked">{t("Dự án đã có nhãn tên này.")}</p>}
        </Field>
        <Field label={t("Màu")}><ColorPicker value={v.color} onChange={(color) => setV({ ...v, color })} /></Field>
        <div className="flex items-center gap-2 text-xs text-muted-fg">
          {t("Xem trước:")}
          <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium" style={{ background: v.color + '22', color: v.color }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: v.color }} />{v.name || t("Tên nhãn")}
          </span>
        </div>
        <Footer onClose={onClose} onSave={save} disabled={!v.name.trim() || dup || busy} label={initial ? t("Lưu thay đổi") : t("Thêm nhãn")} />
      </div>
    </Modal>
  );
}

/* ---------------- Trạng thái ---------------- */
export interface StatusValue { name: string; color: string; kind: StatusKind }
const KIND_HELP: Record<StatusKind, string> = {
  todo: 'Task chưa bắt đầu. Ghi log đầu tiên sẽ tự chuyển sang trạng thái "Đang chạy".',
  running: 'Đang thực hiện — được đếm là "đang chạy" ở Home và biểu tượng nhấp nháy ở Graph.',
  blocked: 'Đang bị chặn/chờ — hiện màu cảnh báo.',
  done: 'Đã xong — tính vào tiến độ %, gạch tên task.',
};

export function StatusModal({ open, onClose, initial, onSave, title }: {
  open: boolean; onClose: () => void; initial?: StatusValue; onSave: (v: StatusValue) => Promise<unknown> | void; title: string;
}) {
  const [v, setV] = useState<StatusValue>({ name: '', color: '#a855f7', kind: 'running' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setV(initial ?? { name: '', color: '#a855f7', kind: 'running' }); }, [open, initial]);
  const save = async () => {
    if (!v.name.trim()) return;
    setBusy(true);
    await onSave({ ...v, name: v.name.trim() });
    setBusy(false);
  };
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <Field label={t("Tên trạng thái")}>
          <input autoFocus className={inputCls} placeholder={t("vd: Review, Chờ dữ liệu, Tạm dừng")} value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && save()} />
        </Field>
        <Field label={t("Màu")}><ColorPicker value={v.color} onChange={(color) => setV({ ...v, color })} /></Field>
        <Field label={t("Thuộc loại")} hint={t(KIND_HELP[v.kind])}>
          <select className={inputCls} value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as StatusKind })}>
            {(Object.keys(KIND_LABEL) as StatusKind[]).map((k) => <option key={k} value={k}>{t(KIND_LABEL[k])}</option>)}
          </select>
        </Field>
        <Footer onClose={onClose} onSave={save} disabled={!v.name.trim() || busy} label={initial ? t("Lưu thay đổi") : t("Thêm trạng thái")} />
      </div>
    </Modal>
  );
}

/** Xóa trạng thái: chọn trạng thái để chuyển các task đang dùng sang. */
export function DeleteStatusModal({ status, others, onClose, onConfirm }: {
  status: StatusDef | null; others: StatusDef[]; onClose: () => void; onConfirm: (moveTo: string) => Promise<unknown> | void;
}) {
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (status) setTo(others.find((o) => o.kind === status.kind)?.key ?? others[0]?.key ?? ''); }, [status, others]);
  return (
    <Modal open={!!status} onClose={onClose} title={t("Xóa trạng thái")}>
      <div className="space-y-4">
        <p className="text-sm">{t('Các task đang ở “{name}” (ở mọi dự án) sẽ được chuyển sang:', { name: status?.name ?? '' })}</p>
        <select className={inputCls} value={to} onChange={(e) => setTo(e.target.value)}>
          {others.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
        </select>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t("Hủy")}</Button>
          <Button variant="danger" disabled={!to || busy} onClick={async () => { setBusy(true); await onConfirm(to); setBusy(false); }}>{t("Xóa trạng thái")}</Button>
        </div>
      </div>
    </Modal>
  );
}
