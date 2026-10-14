import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../common/auth';
import { PrismaService } from '../prisma/prisma.module';
import { StatusesService } from '../statuses/statuses.service';

const p2 = (n: number) => String(n).padStart(2, '0');
/** YYYY-MM-DD theo giờ địa phương của server. */
const ymd = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** Thứ Hai là đầu tuần */
const startOfWeek = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

type Kind = 'created' | 'completed' | 'logs' | 'notes' | 'comments' | 'commits' | 'changes';
const KINDS: Kind[] = ['created', 'completed', 'logs', 'notes', 'comments', 'commits', 'changes'];
interface Ev { at: Date; kind: Kind; projectId: string }

@Injectable()
export class ProfileService {
  constructor(private prisma: PrismaService, private statuses: StatusesService) {}

  async stats(userId: string, projectId?: string) {
    const projectWhere = { ownerId: userId, ...(projectId ? { id: projectId } : {}) };
    const taskWhere = { project: projectWhere };
    const childWhere = { task: { project: projectWhere } };
    const sel = { createdAt: true, task: { select: { projectId: true } } } as const;

    const [projects, tasks, logs, notes, comments, commits, changes, kinds] = await Promise.all([
      this.prisma.project.findMany({ where: { ownerId: userId }, orderBy: { createdAt: 'asc' }, select: { id: true, title: true, color: true } }),
      this.prisma.task.findMany({ where: taskWhere, select: { id: true, projectId: true, status: true, createdAt: true, completedAt: true, dueDate: true } }),
      this.prisma.metricLog.findMany({ where: childWhere, select: sel }),
      this.prisma.note.findMany({ where: childWhere, select: sel }),
      this.prisma.comment.findMany({ where: childWhere, select: sel }),
      this.prisma.commit.findMany({ where: childWhere, select: sel }),
      this.prisma.change.findMany({ where: childWhere, select: sel }),
      this.statuses.kinds(userId),
    ]);

    const events: Ev[] = [];
    for (const t of tasks) {
      events.push({ at: t.createdAt, kind: 'created', projectId: t.projectId });
      if (t.completedAt) events.push({ at: t.completedAt, kind: 'completed', projectId: t.projectId });
    }
    const add = (rows: { createdAt: Date; task: { projectId: string } }[], kind: Kind) =>
      rows.forEach((r) => events.push({ at: r.createdAt, kind, projectId: r.task.projectId }));
    add(logs, 'logs'); add(notes, 'notes'); add(comments, 'comments'); add(commits, 'commits'); add(changes, 'changes');

    const today = startOfDay(new Date());
    const from = addDays(today, -364);

    // ---- theo ngày (365 ngày gần nhất)
    const empty = () => ({ total: 0, created: 0, completed: 0, logs: 0, notes: 0, comments: 0, commits: 0, changes: 0 });
    const byDay = new Map<string, ReturnType<typeof empty>>();
    for (let i = 0; i < 365; i++) byDay.set(ymd(addDays(from, i)), empty());
    const perProject = new Map<string, Record<string, number>>();
    const allDays = new Set<string>();
    for (const e of events) {
      const k = ymd(e.at);
      allDays.add(k);
      const d = byDay.get(k);
      if (d) { d[e.kind]++; d.total++; }
      if (e.at >= from) {
        const m = perProject.get(e.projectId) ?? {};
        m[k] = (m[k] ?? 0) + 1;
        perProject.set(e.projectId, m);
      }
    }
    const days = [...byDay.entries()].map(([date, v]) => ({ date, ...v }));

    // ---- streak
    const hasActivity = (d: Date) => allDays.has(ymd(d));
    let current = 0;
    let cursor = hasActivity(today) ? today : addDays(today, -1);
    while (hasActivity(cursor)) { current++; cursor = addDays(cursor, -1); }
    let longest = 0;
    let run = 0;
    let prev: Date | null = null;
    for (const k of [...allDays].sort()) {
      const d = new Date(k + 'T00:00:00');
      run = prev && Math.round((+d - +prev) / 86400000) === 1 ? run + 1 : 1;
      longest = Math.max(longest, run);
      prev = d;
    }

    // ---- tuần này / tuần trước
    const w0 = startOfWeek(today);
    const w1 = addDays(w0, -7);
    const inRange = (e: Ev, a: Date, b: Date) => e.at >= a && e.at < b;
    const wk = (a: Date, b: Date) => ({
      completed: events.filter((e) => e.kind === 'completed' && inRange(e, a, b)).length,
      activity: events.filter((e) => inRange(e, a, b)).length,
    });
    const thisWeek = wk(w0, addDays(w0, 7));
    const lastWeek = wk(w1, w0);

    // ---- đúng hạn
    const done = tasks.filter((t) => t.completedAt && t.dueDate);
    const onTime = done.filter((t) => startOfDay(t.completedAt!) <= startOfDay(t.dueDate!)).length;

    // ---- theo thứ trong tuần (task hoàn thành), Thứ Hai = 0
    const byWeekday = Array.from({ length: 7 }, () => 0);
    for (const e of events) if (e.kind === 'completed' && e.at >= from) byWeekday[(e.at.getDay() + 6) % 7]++;

    const totals = Object.fromEntries(KINDS.map((k) => [k, days.reduce((s, d) => s + d[k], 0)])) as Record<Kind, number>;
    const activeDays = days.filter((d) => d.total > 0).length;

    // ---- từng dự án
    const out = projects.map((p) => {
      const pt = tasks.filter((t) => t.projectId === p.id);
      const pe = events.filter((e) => e.projectId === p.id && e.kind === 'completed');
      return {
        id: p.id, title: p.title, color: p.color, total: pt.length,
        done: pt.filter((t) => kinds.get(t.status) === 'done').length,
        running: pt.filter((t) => kinds.get(t.status) === 'running').length,
        doneThisWeek: pe.filter((e) => inRange(e, w0, addDays(w0, 7))).length,
        doneLastWeek: pe.filter((e) => inRange(e, w1, w0)).length,
        activity: perProject.get(p.id) ?? {},
      };
    });

    return {
      from: ymd(from), to: ymd(today), days, totals, activeDays,
      streak: { current, longest }, thisWeek, lastWeek,
      onTime: { done: done.length, onTime }, byWeekday,
      projects: projectId ? out.filter((p) => p.id === projectId) : out,
    };
  }
}

@Controller('profile')
export class ProfileController {
  constructor(private s: ProfileService) {}
  @Get('stats') stats(@CurrentUser() u: AuthUser, @Query('projectId') projectId?: string) { return this.s.stats(u.id, projectId || undefined); }
}

@Module({ controllers: [ProfileController], providers: [ProfileService] })
export class ProfileModule {}
