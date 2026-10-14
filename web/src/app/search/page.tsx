'use client';
import { t } from '@/lib/i18n';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FileText, FlaskConical, FolderKanban, Search } from 'lucide-react';
import { useSearch } from '@/lib/hooks';
import { taskHref } from '@/lib/utils';
import { Card, Spinner, inputCls } from '@/components/ui';
import { StatusPill } from '@/components/task-bits';
import { cn } from '@/lib/utils';

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const init = new URLSearchParams(window.location.search).get('q') ?? '';
    setQ(init); setDebounced(init); ref.current?.focus();
  }, []);
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);

  const { data, isFetching } = useSearch(debounced);
  const total = data ? data.projects.length + data.tasks.length + data.notes.length : 0;
  const snippet = (s: string) => { const i = s.toLowerCase().indexOf(debounced.trim().toLowerCase()); return i < 0 ? s.slice(0, 120) : (i > 40 ? '…' : '') + s.slice(Math.max(0, i - 40), i + 100); };

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-3xl px-6 py-8 md:px-8">
        <h1 className="mb-5 text-2xl font-semibold tracking-tight">Search</h1>
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-fg" />
          <input ref={ref} className={cn(inputCls, 'h-12 pl-11 text-base')} placeholder={t("Tìm dự án, task, note…")} value={q} onChange={(e) => setQ(e.target.value)} />
          {isFetching && <Spinner className="absolute right-4 top-1/2 -translate-y-1/2" />}
        </div>

        {!debounced.trim() && <p className="mt-10 text-center text-sm text-muted-fg">{t("Gõ để tìm trong toàn bộ dự án, task (tên + mô tả) và note.")}</p>}
        {data && debounced.trim() && total === 0 && !isFetching && <p className="mt-10 text-center text-sm text-muted-fg">{t('Không có kết quả cho “{q}”.', { q: debounced })}</p>}

        {data && total > 0 && (
          <div className="mt-6 space-y-5">
            {data.projects.length > 0 && (
              <Card title={t('Dự án ({n})', { n: data.projects.length })}>
                <ul className="-mx-2">
                  {data.projects.map((p) => (
                    <li key={p.id}><Link href={`/projects/${p.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted">
                      <FolderKanban size={16} style={{ color: p.color }} /><span className="font-medium">{p.title}</span>
                      <span className="truncate text-sm text-muted-fg">{p.description}</span></Link></li>
                  ))}
                </ul>
              </Card>
            )}
            {data.tasks.length > 0 && (
              <Card title={`Task (${data.tasks.length})`}>
                <ul className="-mx-2">
                  {data.tasks.map((t) => (
                    <li key={t.id}><Link href={taskHref(t.project.id, t.id)} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted">
                      <FlaskConical size={16} className="flex-none text-muted-fg" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{t.title}</div>
                        <div className="truncate text-xs text-muted-fg">{t.project.title}</div>
                      </div>
                      <StatusPill status={t.status} /></Link></li>
                  ))}
                </ul>
              </Card>
            )}
            {data.notes.length > 0 && (
              <Card title={`Notes (${data.notes.length})`}>
                <ul className="-mx-2">
                  {data.notes.map((n) => (
                    <li key={n.id}><Link href={taskHref(n.task.project.id, n.task.id, 'notes')} className="flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-muted">
                      <FileText size={16} className="mt-0.5 flex-none text-muted-fg" />
                      <div className="min-w-0">
                        <div className="text-sm font-mediumt(">{n.title || 'Không tiêu đề'} <span className=")font-normal text-muted-fg">· {n.task.project.title} › {n.task.title}</span></div>
                        <p className="line-clamp-2 text-xs text-muted-fg">{snippet(n.body)}</p>
                      </div>
                    </Link></li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
