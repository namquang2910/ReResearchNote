'use client';
import { t } from '@/lib/i18n';
import Link from 'next/link';
import { FolderKanban, Pencil, Star } from 'lucide-react';
import type { ProjectSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

export function ProjectIcon({ color, size = 40 }: { color: string; size?: number }) {
  return (
    <span className="flex flex-none items-center justify-center rounded-xl" style={{ width: size, height: size, background: color + '22', color }}>
      <FolderKanban size={size * 0.5} />
    </span>
  );
}

export default function ProjectCard({ p, onFavorite, onEdit }: { p: ProjectSummary; onFavorite?: () => void; onEdit?: () => void }) {
  const pct = p.taskCount ? Math.round((p.doneCount / p.taskCount) * 100) : 0;
  return (
    <Link href={`/projects/${p.id}`}
      className="group relative block rounded-2xl border bg-card p-5 shadow-card transition hover:border-primary/50 hover:shadow-pop">
      <div className="flex items-start gap-3">
        <ProjectIcon color={p.color} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{p.title}</div>
          <p className="mt-0.5 line-clamp-1 text-sm text-muted-fg">{p.description || t("Chưa có mô tả")}</p>
        </div>
        {onEdit && (
          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(); }} title={t("Chỉnh sửa dự án")}
            className="rounded-lg p-1.5 text-muted-fg opacity-0 transition hover:bg-muted hover:text-fg group-hover:opacity-100">
            <Pencil size={16} />
          </button>
        )}
        {onFavorite && (
          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onFavorite(); }}
            className={cn('rounded-lg p-1.5 transition hover:bg-muted', p.favorite ? 'text-amber-500' : 'text-muted-fg opacity-0 group-hover:opacity-100')}
            title={p.favorite ? t("Bỏ khỏi Favorites") : t("Thêm vào Favorites")}>
            <Star size={16} className={p.favorite ? 'fill-current' : ''} />
          </button>
        )}
      </div>
      <div className="mt-5 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: p.color }} />
        </div>
        <span className="text-sm font-semibold tabular-nums">{pct}%</span>
      </div>
      <div className="mt-3 text-xs text-muted-fg">
        {t('{n} tasks', { n: p.taskCount })} · {t('{n} đang chạy', { n: p.runningCount })} · {t('{n} hoàn thành', { n: p.doneCount })}
      </div>
    </Link>
  );
}
