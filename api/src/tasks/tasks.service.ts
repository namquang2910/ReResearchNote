import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessService } from '../common/access.service';
import { PrismaService } from '../prisma/prisma.module';
import { StatusesService } from '../statuses/statuses.service';
import { summarizedLogs } from '../common/logs';
import * as D from './dto';

/** Các tài nguyên con của task và trường cho phép ghi. */
const KINDS: Record<string, { model: string; fields: string[] }> = {
  logs: { model: 'metricLog', fields: ['metricId', 'step', 'value', 'std'] },
  changes: { model: 'change', fields: ['text'] },
  commits: { model: 'commit', fields: ['hash', 'message'] },
  comments: { model: 'comment', fields: ['text'] },
  notes: { model: 'note', fields: ['title', 'body'] },
};
const PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService, private statuses: StatusesService, private access: AccessService) {}

  async create(userId: string, projectId: string, dto: D.CreateTaskDto) {
    await this.access.project(userId, projectId);
    if (dto.status) await this.statuses.assertKey(userId, dto.status);
    const kinds = await this.statuses.kinds(userId);
    const status = dto.status ?? [...kinds.entries()].find(([, k]) => k === 'todo')?.[0] ?? 'todo';
    return this.prisma.task.create({
      data: {
        projectId, title: dto.title, description: dto.description ?? '', status,
        completedAt: kinds.get(status) === 'done' ? new Date() : null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      },
    });
  }

  /** Tạo nhiều task một lượt (từ AI / thêm nhanh): nhãn mới tự tạo, phụ thuộc nối theo tiêu đề, bỏ qua nếu tạo vòng. */
  async bulkCreate(userId: string, projectId: string, dto: D.BulkTasksDto) {
    await this.access.project(userId, projectId);
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { labels: true, tasks: { select: { id: true, title: true, dependsOn: { select: { id: true } } } } },
    });
    const kinds = await this.statuses.list(userId);
    const todoKey = kinds.find((k) => k.kind === 'todo')?.key ?? 'todo';

    return this.prisma.$transaction(async (tx) => {
      const labelId = new Map(project.labels.map((l) => [l.name.toLowerCase(), l.id]));
      const newLabels: string[] = [];
      const byTitle = new Map(project.tasks.map((t) => [t.title.toLowerCase(), t.id]));
      const graph = new Map(project.tasks.map((t) => [t.id, t.dependsOn.map((d) => d.id)]));
      const created: { id: string; title: string; draft: D.DraftTaskDto }[] = [];

      for (const d of dto.tasks) {
        const names = [...new Set((d.labels ?? []).map((n) => n.trim()).filter(Boolean))];
        const ids: string[] = [];
        for (const n of names) {
          let id = labelId.get(n.toLowerCase());
          if (!id) {
            id = (await tx.label.create({ data: { projectId, name: n, color: PALETTE[labelId.size % PALETTE.length] } })).id;
            labelId.set(n.toLowerCase(), id);
            newLabels.push(n);
          }
          ids.push(id);
        }
        const status = d.status && kinds.some((k) => k.key === d.status) ? d.status : todoKey;
        const t = await tx.task.create({
          data: {
            projectId, title: d.title.trim(), description: d.description ?? '', status,
            completedAt: kinds.find((k) => k.key === status)?.kind === 'done' ? new Date() : null,
            dueDate: d.dueDate ? new Date(d.dueDate.length === 10 ? d.dueDate + 'T09:00:00' : d.dueDate) : null,
            labels: { connect: ids.map((id) => ({ id })) },
          },
        });
        byTitle.set(t.title.toLowerCase(), t.id);
        graph.set(t.id, []);
        created.push({ id: t.id, title: t.title, draft: d });
      }

      const reaches = (from: string, target: string) => {
        const seen = new Set<string>();
        const st = [from];
        while (st.length) {
          const x = st.pop()!;
          if (x === target) return true;
          for (const n of graph.get(x) ?? []) if (!seen.has(n)) { seen.add(n); st.push(n); }
        }
        return false;
      };
      let linked = 0;
      let skipped = 0;
      for (const c of created) {
        for (const depTitle of c.draft.dependsOn ?? []) {
          const depId = byTitle.get(depTitle.trim().toLowerCase());
          // dep -> c.id hợp lệ nếu dep chưa (gián tiếp) phụ thuộc vào c
          if (!depId || depId === c.id || (graph.get(c.id) ?? []).includes(depId) || reaches(depId, c.id)) { skipped++; continue; }
          await tx.task.update({ where: { id: c.id }, data: { dependsOn: { connect: { id: depId } } } });
          graph.get(c.id)!.push(depId);
          linked++;
        }
      }
      return { created: created.map(({ id, title }) => ({ id, title })), newLabels, linked, skippedDeps: skipped };
    });
  }

  async detail(userId: string, id: string) {
    await this.access.task(userId, id);
    const t = await this.prisma.task.findUniqueOrThrow({
      where: { id },
      include: {
        labels: { select: { id: true } },
        dependsOn: { select: { id: true, title: true, status: true } },
        dependents: { select: { id: true, title: true, status: true } },
        changes: { orderBy: { createdAt: 'desc' }, take: 200 },
        commits: { orderBy: { createdAt: 'desc' }, take: 200 },
        comments: { orderBy: { createdAt: 'desc' }, take: 200 },
        notes: { orderBy: { updatedAt: 'desc' }, take: 200 },
      },
    });
    // log: tóm tắt cho biểu đồ (≤ ~150 điểm/metric); toàn bộ bản ghi lấy qua GET /tasks/:id/logs (phân trang)
    const { logs, counts } = await summarizedLogs(this.prisma, { userId, taskId: id, max: 150 });
    const { labels, ...rest } = t;
    return { ...rest, logs: logs.get(id) ?? [], logCounts: counts.get(id) ?? {}, labelIds: labels.map((l) => l.id) };
  }

  /** Bản ghi log đầy đủ của một task, phân trang theo offset (step tăng dần). */
  async logsPage(userId: string, taskId: string, metricId?: string, offset = 0, limit = 50) {
    await this.access.task(userId, taskId);
    const where = { taskId, ...(metricId ? { metricId } : {}) };
    const take = Math.min(Math.max(limit, 1), 200);
    const [items, total] = await Promise.all([
      this.prisma.metricLog.findMany({ where, orderBy: [{ step: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }], skip: Math.max(offset, 0), take }),
      this.prisma.metricLog.count({ where }),
    ]);
    return { items, total, nextOffset: offset + items.length < total ? offset + items.length : null };
  }

  async update(userId: string, id: string, dto: D.UpdateTaskDto) {
    const cur = await this.access.task(userId, id);
    const { dueDate, ...rest } = dto;
    let completedAt: Date | null | undefined;
    if (dto.status) {
      await this.statuses.assertKey(userId, dto.status);
      const kinds = await this.statuses.kinds(userId);
      const was = kinds.get(cur.status) === 'done';
      const now = kinds.get(dto.status) === 'done';
      if (now && !was) completedAt = new Date();
      else if (!now && was) completedAt = null;
    }
    return this.prisma.task.update({
      where: { id },
      data: {
        ...rest,
        ...(completedAt !== undefined && { completedAt }),
        ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.access.task(userId, id);
    await this.prisma.task.delete({ where: { id } });
    return { ok: true };
  }

  async setLabels(userId: string, id: string, ids: string[]) {
    const task = await this.access.task(userId, id);
    // chỉ nhận nhãn thuộc cùng dự án
    const valid = await this.prisma.label.findMany({ where: { id: { in: ids }, projectId: task.projectId }, select: { id: true } });
    await this.prisma.task.update({ where: { id }, data: { labels: { set: valid.map((l) => ({ id: l.id })) } } });
    return { ok: true };
  }

  /** B phụ thuộc A  =>  không cho phép nếu A (trực tiếp/gián tiếp) đã phụ thuộc B. */
  async addDep(userId: string, id: string, dependsOnId: string) {
    if (id === dependsOnId) throw new BadRequestException('Task không thể phụ thuộc chính nó');
    const task = await this.access.task(userId, id);
    const rows = await this.prisma.task.findMany({
      where: { projectId: task.projectId },
      select: { id: true, dependsOn: { select: { id: true } } },
    });
    const g = new Map(rows.map((r) => [r.id, r.dependsOn.map((d) => d.id)]));
    if (!g.has(dependsOnId)) throw new NotFoundException('Task không thuộc cùng dự án');
    const seen = new Set<string>();
    const st = [dependsOnId];
    while (st.length) {
      const x = st.pop()!;
      if (x === id) throw new BadRequestException('Sẽ tạo vòng phụ thuộc');
      for (const n of g.get(x) ?? []) if (!seen.has(n)) { seen.add(n); st.push(n); }
    }
    await this.prisma.task.update({ where: { id }, data: { dependsOn: { connect: { id: dependsOnId } } } });
    return { ok: true };
  }

  async removeDep(userId: string, id: string, depId: string) {
    await this.access.task(userId, id);
    await this.prisma.task.update({ where: { id }, data: { dependsOn: { disconnect: { id: depId } } } });
    return { ok: true };
  }

  /* tài nguyên con */
  private kind(kind: string) {
    const k = KINDS[kind];
    if (!k) throw new NotFoundException(`Unknown resource "${kind}"`);
    return k;
  }
  private pick(fields: string[], body: any) {
    const out: any = {};
    for (const f of fields) if (body?.[f] !== undefined) out[f] = body[f];
    return out;
  }
  private str(v: unknown, max: number) {
    if (typeof v !== 'string') throw new BadRequestException('Giá trị không hợp lệ');
    if (v.length > max) throw new BadRequestException(`Tối đa ${max} ký tự`);
    return v;
  }
  private sanitize(kind: string, data: any) {
    if (kind === 'changes' || kind === 'comments') { if ('text' in data) data.text = this.str(data.text, 5000); }
    if (kind === 'commits') {
      if ('hash' in data) data.hash = this.str(data.hash, 100);
      if ('message' in data) data.message = this.str(data.message, 1000);
    }
    if (kind === 'notes') {
      if ('title' in data) data.title = this.str(data.title, 300);
      if ('body' in data) data.body = this.str(data.body, 50_000);
    }
    return data;
  }

  async addItem(userId: string, taskId: string, kindName: string, body: any) {
    const k = this.kind(kindName);
    const task = await this.access.task(userId, taskId);
    const data = this.sanitize(kindName, this.pick(k.fields, body));
    const db = (this.prisma as any)[k.model];

    if (kindName === 'logs') {
      if (typeof data.metricId !== 'string' || typeof data.value !== 'number' || !Number.isFinite(data.value))
        throw new BadRequestException('metricId và value là bắt buộc');
      if (data.std == null) delete data.std;
      else if (typeof data.std !== 'number' || data.std < 0) throw new BadRequestException('std phải là số không âm');
      // metric phải thuộc cùng dự án với task
      const metric = await this.prisma.metric.findFirst({ where: { id: data.metricId, projectId: task.projectId } });
      if (!metric) throw new NotFoundException('Metric not found');
      if (typeof data.step !== 'number' || !Number.isFinite(data.step)) {
        const last = await db.aggregate({ where: { taskId, metricId: data.metricId }, _max: { step: true } });
        data.step = (last._max.step ?? 0) + 1;
      }
      // ghi log đầu tiên -> task đang ở nhóm "todo" tự chuyển sang trạng thái "running" đầu tiên
      const list = await this.statuses.list(userId);
      const curKind = list.find((s) => s.key === task.status)?.kind;
      const running = list.find((s) => s.kind === 'running');
      if (curKind === 'todo' && running) await this.prisma.task.update({ where: { id: taskId }, data: { status: running.key } });
    }
    return db.create({ data: { ...data, taskId } });
  }

  /** Mục con phải thuộc task của chính người dùng. */
  private async ownedItem(userId: string, kindName: string, id: string) {
    const k = this.kind(kindName);
    const row = await (this.prisma as any)[k.model].findFirst({ where: { id, task: { project: { ownerId: userId } } } });
    if (!row) throw new NotFoundException('Item not found');
    return { k, row };
  }

  async updateItem(userId: string, kindName: string, id: string, body: any) {
    const { k, row } = await this.ownedItem(userId, kindName, id);
    const data = this.sanitize(kindName, this.pick(k.fields, body));
    if (kindName === 'logs' && data.metricId !== undefined) {
      const task = await this.prisma.task.findUniqueOrThrow({ where: { id: row.taskId } });
      const m = await this.prisma.metric.findFirst({ where: { id: data.metricId, projectId: task.projectId } });
      if (!m) throw new NotFoundException('Metric not found');
    }
    return (this.prisma as any)[k.model].update({ where: { id }, data });
  }

  async removeItem(userId: string, kindName: string, id: string) {
    const { k } = await this.ownedItem(userId, kindName, id);
    await (this.prisma as any)[k.model].delete({ where: { id } });
    return { ok: true };
  }
}
