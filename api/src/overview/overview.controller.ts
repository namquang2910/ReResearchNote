import { Controller, Get, Query } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../common/auth';
import { PrismaService } from '../prisma/prisma.module';
import { makeCursor, parseCursor, summarizedLogs } from '../common/logs';

/** Các endpoint xuyên dự án (của riêng người dùng): Home, Experiments, Calendar, Notes, Search. */
@Controller()
export class OverviewController {
  constructor(private prisma: PrismaService) {}

  @Get('experiments')
  async experiments(@CurrentUser() u: AuthUser) {
    const rows = await this.prisma.task.findMany({
      where: { project: { ownerId: u.id } },
      orderBy: { createdAt: 'asc' },
      take: 5000, // giới hạn an toàn
      include: {
        labels: { select: { id: true, name: true, color: true, projectId: true } },
        dependsOn: { select: { id: true } },
        project: { select: { id: true, title: true, color: true, metrics: { orderBy: { order: 'asc' } } } },
      },
    });
    const { logs, counts } = await summarizedLogs(this.prisma, { userId: u.id, max: 30 });
    return rows.map(({ dependsOn, ...t }) => ({
      ...t, logs: logs.get(t.id) ?? [], logCounts: counts.get(t.id) ?? {}, dependsOnIds: dependsOn.map((d) => d.id),
    }));
  }

  /** Mọi note (phân trang keyset theo updatedAt giảm dần). */
  @Get('notes')
  async notes(@CurrentUser() u: AuthUser, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    const c = parseCursor(cursor);
    const take = Math.min(Math.max(parseInt(limit ?? '60', 10) || 60, 1), 200);
    const rows = await this.prisma.note.findMany({
      where: {
        task: { project: { ownerId: u.id } },
        ...(c ? { OR: [{ updatedAt: { lt: c.updatedAt } }, { updatedAt: c.updatedAt, id: { lt: c.id } }] } : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      include: { task: { select: { id: true, title: true, status: true, project: { select: { id: true, title: true, color: true } } } } },
    });
    const more = rows.length > take;
    const items = more ? rows.slice(0, take) : rows;
    return { items, nextCursor: more ? makeCursor(items[items.length - 1]) : null };
  }

  @Get('search')
  async search(@CurrentUser() u: AuthUser, @Query('q') q = '') {
    const s = q.trim().slice(0, 100);
    if (!s) return { projects: [], tasks: [], notes: [] };
    const has = { contains: s, mode: 'insensitive' as const };
    const mine = { ownerId: u.id };
    const [projects, tasks, notes] = await Promise.all([
      this.prisma.project.findMany({
        where: { ...mine, OR: [{ title: has }, { description: has }] }, take: 20,
        select: { id: true, title: true, description: true, color: true },
      }),
      this.prisma.task.findMany({
        where: { project: mine, OR: [{ title: has }, { description: has }] }, take: 30,
        select: { id: true, title: true, status: true, description: true, project: { select: { id: true, title: true, color: true } } },
      }),
      this.prisma.note.findMany({
        where: { task: { project: mine }, OR: [{ title: has }, { body: has }] }, take: 30, orderBy: { updatedAt: 'desc' },
        select: { id: true, title: true, body: true, task: { select: { id: true, title: true, project: { select: { id: true, title: true, color: true } } } } },
      }),
    ]);
    return { projects, tasks, notes };
  }
}
