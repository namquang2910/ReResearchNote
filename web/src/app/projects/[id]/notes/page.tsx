'use client';
import { t } from '@/lib/i18n';
import { useState } from 'react';
import { Search, StickyNote } from 'lucide-react';
import { useProjectCtx, useProjectNotes } from '@/lib/hooks';
import { useStatuses } from '@/lib/statuses';
import { ago } from '@/lib/utils';
import { Button, Empty, Spinner, inputCls } from '@/components/ui';

export default function NotesPage() {
  const { project, openTask } = useProjectCtx();
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useProjectNotes(project.id);
  const notes = data?.pages.flatMap((p) => p.items) ?? [];
  const [q, setQ] = useState('');
  const st = useStatuses();
  const list = (notes ?? []).filter((n) => !q.trim() || (n.title + n.body + n.task.title).toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="mx-auto max-w-5xl px-6 py-6 md:px-8">
      <div className="relative mb-5 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" />
        <input className={inputCls + ' pl-9'} placeholder={t("Tìm trong notes…")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {isLoading ? <div className="flex justify-center py-10"><Spinner /></div> : list.length === 0 ? (
        <Empty icon={<StickyNote size={24} />} title={t("Chưa có note nào")} hint={t("Mở một task và thêm note ở tab Notes — tất cả sẽ được gom về đây.")} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((n) => (
            <button key={n.id} onClick={() => openTask(n.task.id, 'notes')}
              className="rounded-2xl border bg-card p-4 text-left shadow-card transition hover:border-primary/50 hover:shadow-pop">
              <div className="flex items-center gap-2 text-xs text-muted-fg">
                <span className="h-2 w-2 rounded-full" style={{ background: st.meta(n.task.status).color }} />
                <span className="truncate">{n.task.title}</span>
                <span className="ml-auto flex-none">{ago(n.updatedAt)}</span>
              </div>
              <div className="mt-2 font-semibold">{n.title || t("Không tiêu đề")}</div>
              <p className="mt-1 line-clamp-5 whitespace-pre-wrap text-sm text-muted-fg">{n.body || '—'}</p>
            </button>
          ))}
        </div>
      )}
      {hasNextPage && (
        <div className="mt-6 flex justify-center">
          <Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>{isFetchingNextPage ? t('Đang tải…') : t('Tải thêm')}</Button>
        </div>
      )}
    </div>
  );
}
