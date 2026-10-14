'use client';
import { t } from '@/lib/i18n';
import type { Project } from '@/lib/types';
import { useStatuses } from '@/lib/statuses';
import { metricSummary, num } from '@/lib/utils';

/** Tiến độ và metric của dự án: chỉ số liệu dạng chữ, không đồ thị. */
export default function ProjectStats({ project }: { project: Project }) {
  const st = useStatuses();
  const total = project.tasks.length;
  const done = project.tasks.filter((t) => st.isDone(t.status)).length;
  const running = project.tasks.filter((t) => st.isRunning(t.status)).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
      <div className="w-[220px] flex-none rounded-xl border bg-card px-4 py-3">
        <div className="text-xs font-medium text-muted-fg">{t("Tiến độ")}</div>
        <div className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight">{pct}%</div>
        <div className="text-xs text-muted-fg">{t('{done}/{total} task xong', { done, total })}{running ? ' · ' + t('{n} đang chạy', { n: running }) : ''}</div>
      </div>

      {project.metrics.map((m) => {
        const s = metricSummary(project.tasks, m);
        return (
          <div key={m.id} className="w-[220px] flex-none rounded-xl border bg-card px-4 py-3">
            <div className="truncate text-xs font-medium text-muted-fg">{m.name} {m.better === 'low' ? '↓' : '↑'}</div>
            {s ? (
              <>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="text-2xl font-semibold tabular-nums tracking-tight">{num(s.best.log.value)}</span>
                  {s.best.log.std != null && <span className="text-sm tabular-nums text-muted-fg">± {num(s.best.log.std)}</span>}
                  {m.unit && <span className="text-sm text-muted-fg">{m.unit}</span>}
                </div>
                <div className="truncate text-xs text-muted-fg" title={s.best.task.title}>{s.best.task.title}</div>
              </>
            ) : (
              <div className="mt-0.5 text-sm text-muted-fg">{t("Chưa có log")}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
