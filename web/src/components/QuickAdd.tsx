'use client';
import { t, tServer } from '@/lib/i18n';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Link2, Sparkles, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useProjects, useToast } from '@/lib/hooks';
import { useStatuses } from '@/lib/statuses';
import { useAuth } from '@/lib/auth';
import { cn, fromInputDate, toInputDate } from '@/lib/utils';
import { Button, Modal, Spinner, inputCls } from './ui';

interface Draft {
  title: string; description: string; status: string; dueDate: string | null; labels: string[]; dependsOn: string[];
  /** chỉ phía client */
  keep?: boolean;
}
interface ParseResult { source: 'ai' | 'rules'; model: string | null; note?: string; tasks: Draft[] }
interface AiInfo { provider: 'anthropic' | 'ollama' | 'none'; available: boolean; models: string[]; default: string; quota: { used: number; limit: number } | null }

interface Ctx { open: (o?: { projectId?: string; text?: string }) => void }
const QuickCtx = createContext<Ctx>({ open: () => {} });
export const useQuickAdd = () => useContext(QuickCtx);

const EXAMPLES = [
  'Chuẩn bị dataset 10k mẫu hạn ngày mai #data\nTrain baseline -> Đánh giá -> Viết báo cáo thứ sáu',
  'Họp xong cần: chạy ablation cho subject vector, so sánh với BYOL, và cập nhật README trước 25/12.',
];

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [init, setInit] = useState<{ projectId?: string; text?: string }>({});
  const { user } = useAuth();
  const open = useCallback((o?: { projectId?: string; text?: string }) => { if (!user) return; setInit(o ?? {}); setOpen(true); }, [user]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open]);

  const value = useMemo(() => ({ open }), [open]);
  return (
    <QuickCtx.Provider value={value}>
      {children}
      <QuickAddModal open={isOpen} init={init} onClose={() => setOpen(false)} />
    </QuickCtx.Provider>
  );
}

function QuickAddModal({ open, init, onClose }: { open: boolean; init: { projectId?: string; text?: string }; onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const toast = useToast();
  const st = useStatuses();
  const { data: projects } = useProjects();
  const { data: ollama } = useQuery({ queryKey: ['aiModels'], queryFn: () => api.get<AiInfo>('/ai/models'), enabled: open, staleTime: 15_000 });

  const [step, setStep] = useState<'input' | 'loading' | 'preview'>('input');
  const [text, setText] = useState('');
  const [projectId, setProjectId] = useState('');
  const [model, setModel] = useState('');
  const [result, setResult] = useState<ParseResult | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingMode, setLoadingMode] = useState<'ai' | 'rules'>('ai');

  // mở modal: đặt lại và chọn dự án mặc định (dự án đang xem, hoặc dự án đầu tiên)
  useEffect(() => {
    if (!open) return;
    setStep('input'); setResult(null); setDrafts([]); setText(init.text ?? '');
    const fromPath = pathname.match(/^\/projects\/([^/]+)/)?.[1];
    setProjectId(init.projectId ?? fromPath ?? '');
  }, [open, init, pathname]);
  useEffect(() => { if (open && !projectId && projects?.length) setProjectId(projects[0].id); }, [open, projectId, projects]);
  useEffect(() => { if (ollama && !model) setModel(ollama.default); }, [ollama, model]);

  const project = projects?.find((p) => p.id === projectId);

  async function analyze(mode: 'ai' | 'rules') {
    if (!text.trim() || !projectId) return;
    setLoadingMode(mode);
    setStep('loading');
    try {
      const r = await api.post<ParseResult>('/ai/parse-tasks', { projectId, text, mode, model: model || undefined });
      if (!r.tasks.length) { toast('Không tách được task nào từ văn bản này', 'error'); setStep('input'); return; }
      setResult(r);
      setDrafts(r.tasks.map((t) => ({ ...t, keep: true })));
      setStep('preview');
    } catch (e: any) {
      toast(e.message ?? t("Không phân tích được"), 'error');
      setStep('input');
    }
  }

  const patch = (i: number, p: Partial<Draft>) => setDrafts((d) => d.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const chosen = drafts.filter((d) => d.keep && d.title.trim());

  async function create() {
    if (!chosen.length) return;
    setSaving(true);
    try {
      const r = await api.post<{ created: unknown[]; newLabels: string[]; linked: number }>(`/projects/${projectId}/tasks/bulk`, {
        tasks: chosen.map(({ keep, ...d }) => ({ ...d, title: d.title.trim() })),
      });
      await qc.invalidateQueries();
      toast(t('Đã tạo {n} task', { n: r.created.length }) + (r.linked ? ', ' + t('{n} phụ thuộc', { n: r.linked }) : '') + (r.newLabels.length ? ', ' + t('{n} nhãn mới', { n: r.newLabels.length }) : ''));
      onClose();
      if (!pathname.startsWith(`/projects/${projectId}`)) router.push(`/projects/${projectId}`);
    } catch (e: any) {
      toast(e.message ?? t("Không tạo được task"), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title={step === 'preview' ? t("Xem lại trước khi tạo") : t("Thêm nhanh bằng AI")}>
      {step === 'input' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-fg">
            {t("Dán ghi chú họp, danh sách việc hoặc gõ tự do. AI sẽ tách thành các task kèm hạn, nhãn và thứ tự phụ thuộc — bạn xem lại rồi mới tạo.")}
          </p>
          <textarea autoFocus rows={8} className={cn(inputCls, 'resize-y')} value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') analyze('ai'); }}
            placeholder={t('Ví dụ:\n- Chuẩn bị dataset SFT 10k mẫu, hạn ngày mai\n- Fine-tune model 1B sau khi có dataset\n- Viết related work trước thứ sáu #paper')} />
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((e, i) => (
              <button key={i} onClick={() => setText(t(e))} className="rounded-full border px-2.5 py-1 text-xs text-muted-fg transition hover:border-primary hover:text-primary">
                {t('Ví dụ {n}', { n: i + 1 })}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-fg">{t("Thêm vào dự án")}</label>
              <select className={inputCls} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {projects?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
            {ollama?.provider === 'ollama' && ollama.models.length > 0 && (
              <div className="min-w-48">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-fg">Model (Ollama)</label>
                <select className={inputCls} value={model} onChange={(e) => setModel(e.target.value)}>
                  {ollama.models.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}
          </div>

          {ollama?.provider === 'anthropic' && ollama.quota && (
            <p className="text-xs text-muted-fg">
              {t('Lượt AI hôm nay: {used}/{limit}', { used: ollama.quota.used, limit: ollama.quota.limit })}
              {ollama.quota.used >= ollama.quota.limit && ' — ' + t('hết lượt, sẽ dùng bộ tách theo luật đơn giản')}
            </p>
          )}

          {ollama && !ollama.available && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-700 dark:text-amber-400">
              <AlertCircle size={16} className="mt-0.5 flex-none" />
              <span>{t("AI chưa sẵn sàng trên máy chủ này. Vẫn dùng được: app sẽ tách theo luật đơn giản (mỗi dòng một task, nhận ngày, #nhãn, mũi tên →).")}</span>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button onClick={() => analyze('rules')} disabled={!text.trim() || !projectId} title={t("Không dùng AI: mỗi dòng một task, tự nhận ngày và #nhãn")}>{t("Tách theo dòng (không AI)")}</Button>
            <Button variant="primary" onClick={() => analyze('ai')} disabled={!text.trim() || !projectId}>
              <Sparkles size={15} /> {t("Phân tích bằng AI")} <kbd className="ml-1 rounded bg-white/20 px-1 text-[10px]">⌘↵</kbd>
            </Button>
          </div>
        </div>
      )}

      {step === 'loading' && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Spinner className="h-6 w-6" />
          <div className="font-medium">{loadingMode === 'ai' ? t('Đang phân tích bằng {model}…', { model: model || 'AI' }) : t('Đang tách task…')}</div>
          {loadingMode === 'ai' && <p className="text-sm text-muted-fg">{ollama?.provider === 'ollama' ? t("Model chạy trên máy bạn nên có thể mất 20–40 giây.") : t('Thường mất vài giây.')}</p>}
        </div>
      )}

      {step === 'preview' && result && (
        <div className="space-y-4">
          {result.note && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-700 dark:text-amber-400">
              <AlertCircle size={16} className="mt-0.5 flex-none" /><span>{tServer(result.note)}</span>
            </div>
          )}
          <p className="text-sm text-muted-fg">
            {result.source === 'ai' ? <>{t("Phân tích bởi")} <b>{result.model}</b>. </> : null}
            {t('Sửa tiêu đề, trạng thái, hạn; bỏ tick những task không cần. Tạo vào')} <b>{project?.title}</b>.
          </p>

          <div className="space-y-2.5">
            {drafts.map((d, i) => (
              <div key={i} className={cn('rounded-xl border p-3 transition', !d.keep && 'opacity-45')}>
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={!!d.keep} onChange={(e) => patch(i, { keep: e.target.checked })} className="h-4 w-4 flex-none accent-[hsl(var(--primary))]" />
                  <input className={cn(inputCls, 'h-9 flex-1 font-medium')} value={d.title} onChange={(e) => patch(i, { title: e.target.value })} />
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-7">
                  <select className={cn(inputCls, 'h-8 w-36 py-0 text-xs')} value={d.status} onChange={(e) => patch(i, { status: e.target.value })}>
                    {st.list.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
                  </select>
                  <input type="date" className={cn(inputCls, 'h-8 w-40 py-0 text-xs')} value={d.dueDate ? toInputDate(fromInputDate(d.dueDate)) : ''}
                    onChange={(e) => patch(i, { dueDate: e.target.value || null })} />
                  {d.labels.map((l) => (
                    <span key={l} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      #{l}
                      <button onClick={() => patch(i, { labels: d.labels.filter((x) => x !== l) })} aria-label={t("Bỏ nhãn")}><X size={11} /></button>
                    </span>
                  ))}
                  {d.dependsOn.map((dep) => (
                    <span key={dep} className="inline-flex max-w-[260px] items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-fg">
                      <Link2 size={11} className="flex-none" /><span className="truncate">sau “{dep}”</span>
                      <button onClick={() => patch(i, { dependsOn: d.dependsOn.filter((x) => x !== dep) })} aria-label={t("Bỏ phụ thuộc")}><X size={11} /></button>
                    </span>
                  ))}
                </div>
                {d.description && <p className="mt-2 pl-7 text-xs text-muted-fg">{d.description}</p>}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <Button variant="ghost" onClick={() => setStep('input')}><ArrowLeft size={15} /> {t("Sửa văn bản")}</Button>
            <Button variant="primary" onClick={create} disabled={!chosen.length || saving}>
              {saving ? t('Đang tạo…') : t('Tạo {n} task', { n: chosen.length })}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
