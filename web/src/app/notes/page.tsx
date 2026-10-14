'use client';
import { t } from '@/lib/i18n';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, StickyNote } from 'lucide-react';
import { useAllNotes } from '@/lib/hooks';
import { ago, taskHref } from '@/lib/utils';
import { Button, Empty, Spinner, inputCls } from '@/components/ui';

export default function NotesPage() {
  const router = useRouter();
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useAllNotes();
  const [q, setQ] = useState('');
  const all = data?.pages.flatMap((p) => p.items) ?? [];
  const list = all.filter((n) => !q.trim() || (n.title + n.body + n.task.title + n.task.project.title).toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-6xl px-6 py-8 md:px-8">
        <header className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight">Notes</h1>
          <p className="mt-1 text-sm text-muted-fg">{t("Mọi note từ các task, mới nhất trước")}</p>
        </header>
        <div className="relative mb-6 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" />
          <input className={inputCls + ' pl-9'} placeholder={t("Tìm trong notes…")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {isLoading ? <div className="flex justify-center py-12"><Spinner /></div> : list.length === 0 ? (
          <Empty icon={<StickyNote size={24} />} title={t("Chưa có note nào")} hint={t("Mở một task và thêm note ở tab Notes — tất cả sẽ được gom về đây.")} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((n) => (
              <button key={n.id} onClick={() => router.push(taskHref(n.task.project.id, n.task.id, 'notes'))}
                className="rounded-2xl border bg-card p-4 text-left shadow-card transition hover:border-primary/50 hover:shadow-pop">
                <div className="flex items-center gap-2 text-xs text-muted-fg">
                  <span className="h-2 w-2 flex-none rounded-sm" style={{ background: n.task.project.color }} />
                  <span className="truncate">{n.task.project.title} › {n.task.title}</span>
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
    </div>
  );
}
