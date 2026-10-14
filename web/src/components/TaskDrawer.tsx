'use client';
import { t } from '@/lib/i18n';
import { useEffect, useState, type ReactNode } from 'react';
import { CartesianGrid, ErrorBar, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { GitCommit, MessageSquare, Plus, StickyNote, Trash2, X, FileDiff, Activity, FileText } from 'lucide-react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { LogPage } from '@/lib/types';
import { useLibrary, useProjectCtx, useTask } from '@/lib/hooks';
import type { TaskDetail } from '@/lib/types';
import { useStatuses } from '@/lib/statuses';
import { PALETTE, ago, bestLog, cn, fromInputDate, lastLog, num, toInputDate, withStd, withUnit } from '@/lib/utils';
import { Button, Empty, Spinner, inputCls } from './ui';
import SuggestInput from './SuggestInput';
import { CheckButton, LabelChip, StatusPicker } from './task-bits';

type Tab = 'detail' | 'metrics' | 'changes' | 'commits' | 'notes' | 'comments';

export default function TaskDrawer() {
  const { taskId, reqTab, openTask, actions } = useProjectCtx();
  const { data: task, isLoading } = useTask(taskId);
  const [tab, setTab] = useState<Tab>('detail');

  useEffect(() => { setTab((reqTab as Tab) ?? 'detail'); }, [taskId, reqTab]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && (document.activeElement as HTMLElement)?.tagName !== 'INPUT' && openTask(null);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [openTask]);

  if (!taskId) return null;
  const tabs: { id: Tab; label: string; icon: ReactNode; n?: number }[] = [
    { id: 'detail', label: t("Chi tiết"), icon: <FileText size={15} /> },
    { id: 'metrics', label: 'Metrics', icon: <Activity size={15} />, n: task ? Object.values(task.logCounts ?? {}).reduce((a, b) => a + b, 0) : undefined },
    { id: 'changes', label: 'Changes', icon: <FileDiff size={15} />, n: task?.changes.length },
    { id: 'commits', label: 'Commits', icon: <GitCommit size={15} />, n: task?.commits.length },
    { id: 'notes', label: 'Notes', icon: <StickyNote size={15} />, n: task?.notes.length },
    { id: 'comments', label: 'Comments', icon: <MessageSquare size={15} />, n: task?.comments.length },
  ];

  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-full animate-slide flex-col border-l bg-card shadow-pop md:relative md:z-auto md:w-[480px] md:flex-none md:shadow-none">
      {isLoading || !task ? (
        <div className="flex flex-1 items-center justify-center"><Spinner /></div>
      ) : (
        <>
          <Head key={task.id} task={task} />
          <nav className="flex gap-0.5 overflow-x-auto border-b px-3">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} title={t.label}
                className={cn('flex flex-none items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-2.5 text-[13px] font-medium transition',
                  tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-fg hover:text-fg')}>
                {t.icon}{t.label}
                {!!t.n && <span className="rounded-md bg-muted px-1.5 text-[11px] text-muted-fg">{t.n}</span>}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-auto p-5">
            {tab === 'detail' && <DetailTab task={task} />}
            {tab === 'metrics' && <MetricsTab task={task} />}
            {tab === 'changes' && <ChangesTab task={task} />}
            {tab === 'commits' && <CommitsTab task={task} />}
            {tab === 'notes' && <NotesTab task={task} />}
            {tab === 'comments' && <CommentsTab task={task} />}
          </div>
          <footer className="flex items-center justify-between border-t px-5 py-3">
            <span className="text-xs text-muted-fg">{t('Tạo {when}', { when: ago(task.createdAt) })}</span>
            <Button variant="danger" size="sm" onClick={async () => {
              if (!confirm(t('Xóa task “{name}”?', { name: task.title }))) return;
              openTask(null);
              await actions.deleteTask(task.id);
            }}><Trash2 size={14} /> {t("Xóa task")}</Button>
          </footer>
        </>
      )}
    </aside>
  );
}

function Head({ task }: { task: TaskDetail }) {
  const { openTask, actions } = useProjectCtx();
  const st = useStatuses();
  const [title, setTitle] = useState(task.title);
  return (
    <header className="flex-none px-5 pb-3 pt-4">
      <div className="flex items-center gap-3">
        <CheckButton done={st.isDone(task.status)} onClick={() => actions.updateTask(task.id, { status: st.isDone(task.status) ? st.todoKey : st.doneKey })} />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("Tên task")}
          onBlur={() => title.trim() && title !== task.title && actions.updateTask(task.id, { title: title.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-lg font-semibold outline-none hover:border-border focus:border-primary" />
        <button onClick={() => openTask(null)} className="rounded-lg p-1.5 text-muted-fg hover:bg-muted" title={t("Đóng (Esc)")}><X size={18} /></button>
      </div>
      <div className="mt-3 pl-8"><StatusPicker status={task.status} onChange={(s) => actions.updateTask(task.id, { status: s })} /></div>
    </header>
  );
}

const SectionLabel = ({ children }: { children: ReactNode }) => (
  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-fg">{children}</div>
);

/* ---------------- Chi tiết ---------------- */
function DetailTab({ task }: { task: TaskDetail }) {
  const { project, actions, openTask } = useProjectCtx();
  const [desc, setDesc] = useState(task.description);
  const { data: library = [] } = useLibrary();

  const toggle = (id: string) =>
    actions.setLabels(task.id, task.labelIds.includes(id) ? task.labelIds.filter((x) => x !== id) : [...task.labelIds, id]);
  const attach = async (labelId: string) => { if (!task.labelIds.includes(labelId)) await actions.setLabels(task.id, [...task.labelIds, labelId]); };
  // gợi ý: nhãn của dự án chưa gắn + nhãn từ thư viện chưa có trong dự án
  const projectNames = new Set(project.labels.map((l) => l.name.toLowerCase()));
  const labelSuggestions = [
    ...project.labels.filter((l) => !task.labelIds.includes(l.id)).map((l) => ({ id: 'p:' + l.id, label: l.name, color: l.color })),
    ...library.filter((i) => i.type === 'label' && !projectNames.has(i.name.toLowerCase())).map((i) => ({ id: 'l:' + i.id, label: i.name, color: i.color ?? undefined })),
  ];

  // ứng viên phụ thuộc: không phải chính nó, chưa phụ thuộc, và không tạo vòng
  const deps = new Map(project.tasks.map((t) => [t.id, t.dependsOnIds]));
  const reachesSelf = (from: string) => {
    const seen = new Set<string>(), st = [from];
    while (st.length) { const x = st.pop()!; if (x === task.id) return true; for (const n of deps.get(x) ?? []) if (!seen.has(n)) { seen.add(n); st.push(n); } }
    return false;
  };
  const candidates = project.tasks.filter((t) => t.id !== task.id && !task.dependsOn.some((d) => d.id === t.id) && !reachesSelf(t.id));

  return (
    <div className="space-y-6">
      <div>
        <SectionLabel>{t("Nhãn")}</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {project.labels.map((l) => <LabelChip key={l.id} label={l} active={task.labelIds.includes(l.id)} onClick={() => toggle(l.id)} />)}
        </div>
<SuggestInput className="mt-2" placeholder={t("Tìm nhãn để thêm, hoặc gõ tên mới…")} items={labelSuggestions}
          existing={project.labels.filter((l) => task.labelIds.includes(l.id)).map((l) => l.name)}
          onPick={async (sg) => {
            if (sg.id.startsWith('p:')) return attach(sg.id.slice(2));
            const l = await actions.addLabel(sg.label, sg.color);
            if (l) await attach(l.id);
          }}
          onCreate={async (name) => { const l = await actions.addLabel(name); if (l) await attach(l.id); }} />
      </div>

      <div>
        <SectionLabel>{t("Hạn chót")}</SectionLabel>
        <div className="flex items-center gap-2">
          <input type="date" className={cn(inputCls, 'h-9 w-48')} value={toInputDate(task.dueDate)}
            onChange={(e) => actions.updateTask(task.id, { dueDate: fromInputDate(e.target.value) })} />
          {task.dueDate && <Button variant="ghost" size="sm" onClick={() => actions.updateTask(task.id, { dueDate: null })}>{t("Xóa hạn")}</Button>}
        </div>
      </div>

      <div>
        <SectionLabel>{t("Mô tả")}</SectionLabel>
        <textarea className={inputCls} rows={6} placeholder={t("Mục tiêu, giả thuyết, cách làm…")} value={desc}
          onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== task.description && actions.updateTask(task.id, { description: desc })} />
      </div>

      <div>
        <SectionLabel>{t("Phụ thuộc vào (cần xong trước)")}</SectionLabel>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {task.dependsOn.length === 0 && <span className="text-sm text-muted-fg">{t("Không có.")}</span>}
          {task.dependsOn.map((d) => (
            <span key={d.id} className="inline-flex items-center gap-1.5 rounded-lg border bg-bg/60 py-1 pl-2.5 pr-1 text-sm">
              <button onClick={() => openTask(d.id)} className="hover:underline">{d.title}</button>
              <button onClick={() => actions.removeDep(task.id, d.id)} className="rounded p-0.5 text-muted-fg hover:bg-muted"><X size={13} /></button>
            </span>
          ))}
        </div>
        <select className={cn(inputCls, 'h-9')} value="" onChange={(e) => e.target.value && actions.addDep(task.id, e.target.value)}>
          <option value="">{t("＋ Thêm phụ thuộc…")}</option>
          {candidates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      </div>

      {task.dependents.length > 0 && (
        <div>
          <SectionLabel>{t("Đang chặn")}</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {task.dependents.map((d) => (
              <button key={d.id} onClick={() => openTask(d.id)} className="rounded-lg border bg-bg/60 px-2.5 py-1 text-sm hover:bg-muted">{d.title}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Metrics ---------------- */
function MetricsTab({ task }: { task: TaskDetail }) {
  const { project, actions } = useProjectCtx();
  const [metricId, setMetricId] = useState(project.metrics[0]?.id ?? '');
  const [step, setStep] = useState('');
  const [value, setValue] = useState('');
  const [std, setStd] = useState('');

  if (!project.metrics.length) return <Empty icon={<Activity size={22} />} title={t("Dự án chưa có metric")} hint={t("Vào tab Cấu hình để thêm metric cần theo dõi.")} />;
  const last = lastLog(task.logs, metricId);
  const nextStep = last ? last.step + 1 : 1;

  async function add() {
    const v = parseFloat(value);
    if (Number.isNaN(v)) return;
    const s = parseFloat(step);
    const sd = parseFloat(std);
    setValue(''); setStep(''); setStd('');
    await actions.addItem(task.id, 'logs', {
      metricId, value: v,
      ...(Number.isNaN(s) ? {} : { step: s }),
      ...(Number.isNaN(sd) || sd < 0 ? {} : { std: sd }),
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-bg/60 p-3.5">
        <SectionLabel>{t("Ghi giá trị mới")}</SectionLabel>
        <div className="flex gap-2">
          <select className={cn(inputCls, 'h-9 flex-1')} value={metricId} onChange={(e) => setMetricId(e.target.value)}>
            {project.metrics.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input className={cn(inputCls, 'h-9 w-20')} type="number" placeholder={`step ${nextStep}`} value={step} onChange={(e) => setStep(e.target.value)} />
          <input className={cn(inputCls, 'h-9 w-24')} type="number" step="any" placeholder={t("giá trị")} value={value}
            onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <input className={cn(inputCls, 'h-9 w-20')} type="number" step="any" min="0" placeholder="± std" value={std} title={t("Độ lệch chuẩn (tuỳ chọn)")}
            onChange={(e) => setStd(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <Button variant="primary" className="h-9" onClick={add} disabled={value === ''}><Plus size={16} /></Button>
        </div>
      </div>

      {project.metrics.map((m, i) => {
        const logs = task.logs.filter((l) => l.metricId === m.id);
        if (!logs.length) return null;
        const best = bestLog(logs, m)!;
        const color = PALETTE[i % PALETTE.length];
        return (
          <div key={m.id} className="rounded-xl border p-4">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="font-semibold">{m.name}</span>
              <span className="text-xs text-muted-fg">{t("tốt nhất")} <b className="text-done">{withStd(best.value, best.std, m)}</b> · {t('mới nhất')} {withStd(lastLog(logs, m.id)!.value, lastLog(logs, m.id)!.std, m)}</span>
            </div>
            <div className="h-36">
              <ResponsiveContainer>
                <LineChart data={logs.map((l) => ({ ...l, e: l.std && l.std > 0 ? l.std : undefined }))} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="step" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-fg))" tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-fg))" tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', fontSize: 12 }}
                    formatter={(v: number, _n, item) => [withStd(v, (item?.payload as { std?: number | null })?.std), m.name]} labelFormatter={(s) => `step ${s}`} />
                  <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.2} dot={{ r: 3, fill: color, strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={false}>
                    <ErrorBar dataKey="e" width={5} strokeWidth={1.5} stroke={color} />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </div>
            <LogRecords taskId={task.id} metricId={m.id} total={task.logCounts[m.id] ?? logs.length} />
          </div>
        );
      })}
      {task.logs.length === 0 && <Empty icon={<Activity size={22} />} title={t("Chưa có log nào")} hint={t("Ghi giá trị metric đầu tiên ở trên. Task sẽ tự chuyển sang “Đang chạy”.")} />}
    </div>
  );
}

/** Bảng bản ghi đầy đủ của một metric — chỉ tải khi mở, phân trang 50 dòng/lần. */
function LogRecords({ taskId, metricId, total }: { taskId: string; metricId: string; total: number }) {
  const { actions } = useProjectCtx();
  const [open, setOpen] = useState(false);
  const q = useInfiniteQuery({
    queryKey: ['logs', taskId, metricId],
    enabled: open,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api.get<LogPage>(`/tasks/${taskId}/logs?metricId=${metricId}&limit=50&offset=${pageParam}`),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <details className="mt-2" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-xs text-muted-fg">{t('{n} bản ghi', { n: total })}</summary>
      {q.isLoading && <div className="flex justify-center py-3"><Spinner /></div>}
      <table className="mt-2 w-full text-sm">
        <tbody>
          {rows.map((l) => (
            <tr key={l.id} className="border-t">
              <td className="py-1.5 text-muted-fg">step {num(l.step)}</td>
              <td className="py-1.5 font-medium tabular-nums">{num(l.value)}{l.std != null && <span className="font-normal text-muted-fg"> ± {num(l.std)}</span>}</td>
              <td className="py-1.5 text-xs text-muted-fg">{ago(l.createdAt)}</td>
              <td className="py-1.5 text-right"><IconDelete onClick={() => actions.removeItem('logs', l.id)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {q.hasNextPage && (
        <div className="mt-2 flex justify-center">
          <Button size="sm" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
            {q.isFetchingNextPage ? t('Đang tải…') : t('Tải thêm ({n} còn lại)', { n: total - rows.length })}
          </Button>
        </div>
      )}
    </details>
  );
}

const IconDelete = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} className="rounded-md p-1 text-muted-fg opacity-60 hover:bg-blocked/10 hover:text-blocked hover:opacity-100"><X size={14} /></button>
);

/* ---------------- Changes / Commits / Comments ---------------- */
function ChangesTab({ task }: { task: TaskDetail }) {
  const { actions } = useProjectCtx();
  const [text, setText] = useState('');
  const add = async () => { const t = text.trim(); if (!t) return; setText(''); await actions.addItem(task.id, 'changes', { text: t }); };
  return (
    <div>
      <div className="flex gap-2">
        <input className={inputCls} placeholder={t("Mô tả thay đổi (code, config, data…)")} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <Button variant="primary" onClick={add} disabled={!text.trim()}>{t("Thêm")}</Button>
      </div>
      <Timeline empty={t("Chưa ghi nhận thay đổi nào.")} items={task.changes.map((c) => ({ id: c.id, at: c.createdAt, body: c.text }))} onDelete={(id) => actions.removeItem('changes', id)} />
    </div>
  );
}
function CommitsTab({ task }: { task: TaskDetail }) {
  const { actions } = useProjectCtx();
  const [hash, setHash] = useState('');
  const [msg, setMsg] = useState('');
  const add = async () => {
    if (!hash.trim() && !msg.trim()) return;
    await actions.addItem(task.id, 'commits', { hash: hash.trim() || '—', message: msg.trim() });
    setHash(''); setMsg('');
  };
  return (
    <div>
      <div className="flex gap-2">
        <input className={cn(inputCls, 'w-28 font-mono text-xs')} placeholder="hash" value={hash} onChange={(e) => setHash(e.target.value)} />
        <input className={inputCls} placeholder="commit message" value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <Button variant="primary" onClick={add}>{t("Thêm")}</Button>
      </div>
      <Timeline empty={t("Chưa liên kết commit nào.")} onDelete={(id) => actions.removeItem('commits', id)}
        items={task.commits.map((c) => ({ id: c.id, at: c.createdAt, body: <><code className="mr-2 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{c.hash}</code>{c.message}</> }))} />
    </div>
  );
}
function CommentsTab({ task }: { task: TaskDetail }) {
  const { actions } = useProjectCtx();
  const [text, setText] = useState('');
  const add = async () => { const t = text.trim(); if (!t) return; setText(''); await actions.addItem(task.id, 'comments', { text: t }); };
  return (
    <div>
      <div className="flex gap-2">
        <input className={inputCls} placeholder={t("Viết comment…")} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <Button variant="primary" onClick={add} disabled={!text.trim()}>{t("Gửi")}</Button>
      </div>
      <Timeline empty={t("Chưa có comment.")} items={task.comments.map((c) => ({ id: c.id, at: c.createdAt, body: c.text }))} onDelete={(id) => actions.removeItem('comments', id)} />
    </div>
  );
}
function Timeline({ items, onDelete, empty }: { items: { id: string; at: string; body: ReactNode }[]; onDelete: (id: string) => void; empty: string }) {
  if (!items.length) return <p className="mt-8 text-center text-sm text-muted-fg">{empty}</p>;
  return (
    <ol className="mt-5 space-y-2">
      {items.map((i) => (
        <li key={i.id} className="group flex items-start gap-3 rounded-xl border bg-bg/50 px-3.5 py-3">
          <div className="min-w-0 flex-1 break-words text-sm">{i.body}<div className="mt-1 text-xs text-muted-fg">{ago(i.at)}</div></div>
          <div className="opacity-0 transition group-hover:opacity-100"><IconDelete onClick={() => onDelete(i.id)} /></div>
        </li>
      ))}
    </ol>
  );
}

/* ---------------- Notes ---------------- */
function NotesTab({ task }: { task: TaskDetail }) {
  const { actions } = useProjectCtx();
  return (
    <div className="space-y-4">
      <Button variant="primary" onClick={() => actions.addItem(task.id, 'notes', { title: t('Note mới'), body: '' })}><Plus size={16} /> {t("Note mới")}</Button>
      {task.notes.length === 0 && <Empty icon={<StickyNote size={22} />} title={t("Chưa có note")} hint={t("Ghi lại ý tưởng, kết quả quan sát hoặc việc cần thử tiếp theo cho task này.")} />}
      {task.notes.map((n) => <NoteCard key={n.id} note={n} />)}
    </div>
  );
}
function NoteCard({ note }: { note: TaskDetail['notes'][number] }) {
  const { actions } = useProjectCtx();
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const save = () => (title !== note.title || body !== note.body) && actions.updateItem('notes', note.id, { title, body });
  return (
    <div className="rounded-xl border p-3.5">
      <div className="flex items-center gap-2">
        <input className="min-w-0 flex-1 bg-transparent font-semibold outline-none" placeholder={t("Tiêu đề")} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={save} />
        <span className="text-xs text-muted-fg">{ago(note.updatedAt)}</span>
        <IconDelete onClick={() => actions.removeItem('notes', note.id)} />
      </div>
      <textarea className="mt-2 w-full resize-y rounded-lg bg-bg/60 p-2.5 text-sm outline-none focus:ring-4 focus:ring-primary/15" rows={5}
        placeholder={t("Viết note…")} value={body} onChange={(e) => setBody(e.target.value)} onBlur={save} />
    </div>
  );
}
