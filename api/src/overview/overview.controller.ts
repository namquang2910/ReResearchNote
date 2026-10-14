import { Controller, Get, Query } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../common/auth';
import { PrismaService } from '../prisma/prisma.module';

/** Các endpoint xuyên dự án (của riêng người dùng): Home, Experiments, Calendar, Notes, Search. */
@Controller()
export class OverviewController {
  constructor(private prisma: PrismaService) {}

  @Get('experiments')
  async experiments(@CurrentUser() u: AuthUser) {
    const rows = await this.prisma.task.findMany({
      where: { project: { ownerId: u.id } },
      orderBy: { createdAt: 'asc' },
      include: {
        labels: { select: { id: true, name: true, color: true, projectId: true } },
        dependsOn: { select: { id: true } },
        logs: { orderBy: { step: 'asc' } },
        project: { select: { id: true, title: true, color: true, metrics: { orderBy: { order: 'asc' } } } },
      },
    });
    return rows.map(({ dependsOn, ...t }) => ({ ...t, dependsOnIds: dependsOn.map((d) => d.id) }));
  }

  @Get('notes')
  notes(@CurrentUser() u: AuthUser) {
    return this.prisma.note.findMany({
      where: { task: { project: { ownerId: u.id } } },
      orderBy: { updatedAt: 'desc' },
      include: { task: { select: { id: true, title: true, status: true, project: { select: { id: true, title: true, color: true } } } } },
    });
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
