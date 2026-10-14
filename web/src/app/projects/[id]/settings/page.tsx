'use client';
import { t } from '@/lib/i18n';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { useLibrary, useProjectCtx } from '@/lib/hooks';
import { KIND_LABEL, useStatuses, type StatusDef } from '@/lib/statuses';
import type { Label, Metric } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button, Card } from '@/components/ui';
import SuggestInput from '@/components/SuggestInput';
import {
  DeleteStatusModal, LabelModal, MetricModal, StatusModal,
  type LabelValue, type MetricValue, type StatusValue,
} from '@/components/SettingsModals';

const IconBtn = ({ children, onClick, title, disabled, danger }: { children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean; danger?: boolean }) => (
  <button onClick={onClick} title={title} disabled={disabled}
    className={cn('rounded-md p-1.5 text-muted-fg transition hover:bg-muted disabled:opacity-30', danger && 'hover:bg-blocked/10 hover:text-blocked')}>{children}</button>
);

const AddBtn = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <Button size="sm" variant="primary" onClick={onClick}><Plus size={14} />{children}</Button>
);

export default function SettingsPage() {
  const { project, actions } = useProjectCtx();
  const router = useRouter();
  const { data: library = [] } = useLibrary();
  const st = useStatuses();

  const [metricModal, setMetricModal] = useState<{ edit?: Metric } | null>(null);
  const [labelModal, setLabelModal] = useState<{ edit?: Label } | null>(null);
  const [statusModal, setStatusModal] = useState<{ edit?: StatusDef } | null>(null);
  const [delStatus, setDelStatus] = useState<StatusDef | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const ms = project.metrics;
  const metricNames = ms.map((m) => m.name);
  const labelNames = project.labels.map((l) => l.name);
  const libMetrics = library.filter((i) => i.type === 'metric');
  const libLabels = library.filter((i) => i.type === 'label');
  const availMetrics = libMetrics.filter((i) => !metricNames.some((n) => n.toLowerCase() === i.name.toLowerCase()));
  const availLabels = libLabels.filter((i) => !labelNames.some((n) => n.toLowerCase() === i.name.toLowerCase()));

  const moveMetric = (id: string, to: number) => {
    const ids = ms.map((m) => m.id).filter((x) => x !== id);
    ids.splice(Math.max(0, Math.min(ids.length, to)), 0, id);
    actions.reorderMetrics(ids);
  };
  const moveStatus = (id: string, to: number) => {
    const ids = st.list.map((s) => s.id).filter((x) => x !== id);
    ids.splice(Math.max(0, Math.min(ids.length, to)), 0, id);
    actions.reorderStatuses(ids);
  };


  return (
    <div className="mx-auto max-w-4xl space-y-5 px-6 py-6 md:px-8">
      {/* ---------- Metrics ---------- */}
      <Card title="Metrics">
        <SuggestInput
          placeholder={t("Tìm metric để thêm, hoặc gõ tên mới…")} existing={metricNames}
          items={availMetrics.map((i) => ({ id: i.id, label: i.name, hint: i.unit || undefined }))}
          onPick={(s) => { const i = availMetrics.find((x) => x.id === s.id)!; return actions.addMetric({ name: i.name, unit: i.unit ?? '', better: (i.better as 'high' | 'low') ?? 'high' }); }}
          onCreate={(name) => actions.addMetric({ name })} />
        <div className="mt-4 space-y-2">
          {ms.length === 0 && <p className="rounded-xl border border-dashed py-6 text-center text-sm text-muted-fg">{t("Chưa có metric. Gõ vào ô trên để thêm.")}</p>}
          {ms.map((m, i) => (
            <div key={m.id} draggable onDragStart={() => setDragId(m.id)} onDragEnd={() => setDragId(null)}
              onDragOver={(e) => e.preventDefault()} onDrop={() => dragId && dragId !== m.id && moveMetric(dragId, i)}
              className={cn('flex items-center gap-3 rounded-xl border bg-bg/50 px-3 py-2.5', dragId === m.id && 'opacity-40')}>
              <GripVertical size={16} className="flex-none cursor-grab text-muted-fg" />
              <span className="w-5 flex-none text-center text-xs text-muted-fg">{i + 1}</span>
              <button onClick={() => setMetricModal({ edit: m })} className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline">{m.name}</button>
              {m.unit && <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-fg">{m.unit}</span>}
              <IconBtn title={t("Sửa")} onClick={() => setMetricModal({ edit: m })}><Pencil size={15} /></IconBtn>
              <IconBtn title={t("Lên")} disabled={i === 0} onClick={() => moveMetric(m.id, i - 1)}><ArrowUp size={15} /></IconBtn>
              <IconBtn title={t("Xuống")} disabled={i === ms.length - 1} onClick={() => moveMetric(m.id, i + 1)}><ArrowDown size={15} /></IconBtn>
              <IconBtn title={t("Xóa")} danger onClick={() => confirm(t('Xóa metric “{name}” và mọi log của nó?', { name: m.name })) && actions.removeMetric(m.id)}><Trash2 size={15} /></IconBtn>
            </div>
          ))}
        </div>
      </Card>

      {/* ---------- Nhãn ---------- */}
      <Card title={t("Nhãn (labels)")}>
        <SuggestInput
          placeholder={t("Tìm nhãn để thêm, hoặc gõ tên mới…")} existing={labelNames}
          items={availLabels.map((i) => ({ id: i.id, label: i.name, color: i.color ?? undefined }))}
          onPick={(s) => { const i = availLabels.find((x) => x.id === s.id)!; return actions.addLabel(i.name, i.color ?? undefined); }}
          onCreate={(name) => actions.addLabel(name)} />
        <div className="mt-4 flex flex-wrap gap-2">
          {project.labels.length === 0 && <p className="w-full rounded-xl border border-dashed py-6 text-center text-sm text-muted-fg">{t("Chưa có nhãn nào.")}</p>}
          {project.labels.map((l) => (
            <span key={l.id} className="inline-flex items-center gap-1 rounded-lg py-1 pl-2.5 pr-1 text-sm font-medium"
              style={{ background: l.color + '22', color: l.color }}>
              <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
              <button onClick={() => setLabelModal({ edit: l })} className="hover:underline">{l.name}</button>
              <button onClick={() => setLabelModal({ edit: l })} title={t("Sửa")} className="rounded p-1 opacity-60 hover:bg-black/10 hover:opacity-100"><Pencil size={12} /></button>
              <button onClick={() => actions.removeLabel(l.id)} title={t("Xóa")} className="rounded p-1 opacity-60 hover:bg-black/10 hover:opacity-100"><Trash2 size={12} /></button>
            </span>
          ))}
        </div>
      </Card>

      {/* ---------- Trạng thái ---------- */}
      <Card title={t("Trạng thái")} right={<AddBtn onClick={() => setStatusModal({})}>{t("Thêm trạng thái")}</AddBtn>}>
        <p className="-mt-2 mb-3 text-sm text-muted-fg">{t("Dùng chung cho mọi dự án. “Loại” quyết định cách tính tiến độ và hiệu ứng.")}</p>
        <div className="space-y-2">
          {st.list.map((s, i) => (
            <div key={s.id} draggable onDragStart={() => setDragId(s.id)} onDragEnd={() => setDragId(null)}
              onDragOver={(e) => e.preventDefault()} onDrop={() => dragId && dragId !== s.id && moveStatus(dragId, i)}
              className={cn('flex items-center gap-3 rounded-xl border bg-bg/50 px-3 py-2.5', dragId === s.id && 'opacity-40')}>
              <GripVertical size={16} className="flex-none cursor-grab text-muted-fg" />
              <span className="h-3 w-3 flex-none rounded-full" style={{ background: s.color }} />
              <button onClick={() => setStatusModal({ edit: s })} className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline">{s.name}</button>
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-fg">{t(KIND_LABEL[s.kind])}</span>
              <IconBtn title={t("Sửa")} onClick={() => setStatusModal({ edit: s })}><Pencil size={15} /></IconBtn>
              <IconBtn title={t("Lên")} disabled={i === 0} onClick={() => moveStatus(s.id, i - 1)}><ArrowUp size={15} /></IconBtn>
              <IconBtn title={t("Xuống")} disabled={i === st.list.length - 1} onClick={() => moveStatus(s.id, i + 1)}><ArrowDown size={15} /></IconBtn>
              <IconBtn title={t("Xóa")} danger disabled={st.list.length <= 2} onClick={() => setDelStatus(s)}><Trash2 size={15} /></IconBtn>
            </div>
          ))}
        </div>
      </Card>

      {/* ---------- Dự án ---------- */}
      <Card title={t("Dự án")}>
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-sm text-muted-fg">{t("Màu nhận diện (hiện ở sidebar, Home, Calendar)")}</label>
          <input type="color" value={project.color} onChange={(e) => actions.updateProject({ color: e.target.value })}
            className="h-9 w-12 cursor-pointer rounded-lg border bg-transparent p-1" />
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
          <p className="text-sm text-muted-fg">{t("Xóa dự án sẽ xóa toàn bộ task, log, note và comment bên trong. Không thể hoàn tác.")}</p>
          <Button variant="danger" onClick={async () => {
            if (!confirm(t('Xóa dự án “{name}”?', { name: project.title }))) return;
            await actions.deleteProject();
            router.push('/');
          }}><Trash2 size={15} /> {t("Xóa dự án")}</Button>
        </div>
      </Card>

      {/* ---------- Modals ---------- */}
      <MetricModal
        open={!!metricModal} onClose={() => setMetricModal(null)}
        title={metricModal?.edit ? t("Sửa metric") : t("Thêm metric")}
        initial={metricModal?.edit && { name: metricModal.edit.name, unit: metricModal.edit.unit, better: metricModal.edit.better }}
        taken={metricModal?.edit ? metricNames.filter((n) => n !== metricModal.edit!.name) : metricNames}
        onSave={async (v: MetricValue) => {
          const r = metricModal?.edit ? await actions.updateMetric(metricModal.edit.id, v) : await actions.addMetric(v);
          if (r) setMetricModal(null);
        }} />

      <LabelModal
        open={!!labelModal} onClose={() => setLabelModal(null)}
        title={labelModal?.edit ? t("Sửa nhãn") : t("Thêm nhãn")}
        initial={labelModal?.edit && { name: labelModal.edit.name, color: labelModal.edit.color }}
        taken={labelModal?.edit ? labelNames.filter((n) => n !== labelModal.edit!.name) : labelNames}
        onSave={async (v: LabelValue) => {
          const r = labelModal?.edit ? await actions.updateLabel(labelModal.edit.id, v) : await actions.addLabel(v.name, v.color);
          if (r) setLabelModal(null);
        }} />

      <StatusModal
        open={!!statusModal} onClose={() => setStatusModal(null)}
        title={statusModal?.edit ? t("Sửa trạng thái") : t("Thêm trạng thái")}
        initial={statusModal?.edit && { name: statusModal.edit.rawName ?? statusModal.edit.name, color: statusModal.edit.color, kind: statusModal.edit.kind }}
        onSave={async (v: StatusValue) => {
          const r = statusModal?.edit ? await actions.updateStatus(statusModal.edit.id, v) : await actions.createStatus(v);
          if (r) setStatusModal(null);
        }} />

      <DeleteStatusModal status={delStatus} others={st.list.filter((s) => s.id !== delStatus?.id)} onClose={() => setDelStatus(null)}
        onConfirm={async (to) => { const r = await actions.deleteStatus(delStatus!.id, to); if (r) setDelStatus(null); }} />
    </div>
  );
}
