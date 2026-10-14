import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';

export interface LogRow { id: string; taskId: string; metricId: string; step: number; value: number; std: number | null; createdAt: Date }

/**
 * Tóm tắt log metric ngay trong Postgres để không phải kéo toàn bộ về:
 * với mỗi (task, metric) giữ lại điểm ĐẦU, điểm CUỐI, điểm TỐT NHẤT (theo hướng của metric) và
 * lấy mẫu đều cho tới ~`max` điểm. Trả kèm tổng số log thật (`counts`) để giao diện hiển thị đúng.
 * Nhờ vậy giá trị tốt nhất / mới nhất luôn chính xác dù có bao nhiêu log.
 */
export async function summarizedLogs(
  prisma: PrismaService,
  q: { userId: string; projectId?: string; taskId?: string; max?: number },
) {
  const max = Math.max(5, q.max ?? 40);
  const proj = q.projectId ? Prisma.sql`AND t."projectId" = ${q.projectId}` : Prisma.empty;
  const task = q.taskId ? Prisma.sql`AND l."taskId" = ${q.taskId}` : Prisma.empty;

  const rows = await prisma.$queryRaw<(LogRow & { cnt: number })[]>(Prisma.sql`
    WITH base AS (
      SELECT l.id, l."taskId", l."metricId", l.step, l.value, l.std, l."createdAt",
             count(*) OVER w AS cnt,
             row_number() OVER (w ORDER BY l.step, l."createdAt", l.id) AS rn,
             row_number() OVER (w ORDER BY (CASE WHEN m.better = 'low' THEN l.value ELSE -l.value END), l.step, l.id) AS best_rn
      FROM "MetricLog" l
      JOIN "Metric" m ON m.id = l."metricId"
      JOIN "Task" t ON t.id = l."taskId"
      JOIN "Project" p ON p.id = t."projectId"
      WHERE p."ownerId" = ${q.userId} ${proj} ${task}
      WINDOW w AS (PARTITION BY l."taskId", l."metricId")
    )
    SELECT id, "taskId", "metricId", step, value, std, "createdAt", cnt::int AS cnt
    FROM base
    WHERE cnt <= ${max} OR rn = 1 OR rn = cnt OR best_rn = 1
       OR (rn - 1) % GREATEST(1, CEIL(cnt::float / ${max})::int) = 0
    ORDER BY "taskId", "metricId", step, "createdAt"`);

  const logs = new Map<string, LogRow[]>();
  const counts = new Map<string, Record<string, number>>();
  for (const { cnt, ...r } of rows) {
    const arr = logs.get(r.taskId) ?? [];
    arr.push({ ...r, step: Number(r.step), value: Number(r.value), std: r.std == null ? null : Number(r.std) });
    logs.set(r.taskId, arr);
    const c = counts.get(r.taskId) ?? {};
    c[r.metricId] = Number(cnt);
    counts.set(r.taskId, c);
  }
  return { logs, counts };
}

/** Phân trang theo keyset cho note: sắp theo (updatedAt desc, id desc). */
export function parseCursor(cursor?: string) {
  if (!cursor) return null;
  const [t, id] = cursor.split('|');
  const d = new Date(t);
  return isNaN(+d) || !id ? null : { updatedAt: d, id };
}
export const makeCursor = (r: { updatedAt: Date; id: string }) => `${r.updatedAt.toISOString()}|${r.id}`;
