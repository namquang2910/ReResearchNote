import { Injectable } from '@nestjs/common';
import { AccessService } from '../common/access.service';
import { PrismaService } from '../prisma/prisma.module';
import { StatusesService } from '../statuses/statuses.service';
import * as D from './dto';

const LOWER_BETTER = /loss|error|time|mse|mae|cost|latency|perplexity/i;
const PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService, private statuses: StatusesService, private access: AccessService) {}

  async list(userId: string) {
    const [rows, kinds] = await Promise.all([
      this.prisma.project.findMany({
        where: { ownerId: userId },
        orderBy: { createdAt: 'asc' },
        include: { tasks: { select: { status: true } } },
      }),
      this.statuses.kinds(userId),
    ]);
    return rows.map(({ tasks, ownerId: _o, ...p }) => ({
      ...p,
      taskCount: tasks.length,
      doneCount: tasks.filter((t) => kinds.get(t.status) === 'done').length,
      runningCount: tasks.filter((t) => kinds.get(t.status) === 'running').length,
    }));
  }

  async create(userId: string, dto: D.CreateProjectDto) {
    const n = await this.prisma.project.count({ where: { ownerId: userId } });
    return this.prisma.project.create({
      data: {
        ownerId: userId,
        color: PALETTE[n % PALETTE.length],
        title: dto.title,
        description: dto.description ?? '',
        metrics: {
          create: (dto.metrics ?? []).filter(Boolean).map((name, order) => ({
            name, order, better: LOWER_BETTER.test(name) ? 'low' : 'high',
          })),
        },
      },
    });
  }

  /** Mọi thứ cần cho trang dự án: metrics, labels, tasks kèm deps + logs. */
  async overview(userId: string, id: string) {
    await this.access.project(userId, id);
    const p = await this.prisma.project.findUniqueOrThrow({
      where: { id },
      include: {
        metrics: { orderBy: { order: 'asc' } },
        labels: { orderBy: { name: 'asc' } },
        tasks: {
          orderBy: { createdAt: 'asc' },
          include: {
            labels: { select: { id: true } },
            dependsOn: { select: { id: true } },
            logs: { orderBy: { step: 'asc' } },
            _count: { select: { changes: true, commits: true, comments: true, notes: true } },
          },
        },
      },
    });
    const { ownerId: _o, ...rest } = p;
    return {
      ...rest,
      tasks: p.tasks.map(({ labels, dependsOn, _count, ...t }) => ({
        ...t,
        labelIds: labels.map((l) => l.id),
        dependsOnIds: dependsOn.map((d) => d.id),
        counts: _count,
      })),
    };
  }

  /** Mọi note của dự án, kèm task chứa nó. */
  async notes(userId: string, projectId: string) {
    await this.access.project(userId, projectId);
    return this.prisma.note.findMany({
      where: { task: { projectId } },
      orderBy: { updatedAt: 'desc' },
      include: { task: { select: { id: true, title: true, status: true } } },
    });
  }

  async update(userId: string, id: string, dto: D.UpdateProjectDto) {
    await this.access.project(userId, id);
    return this.prisma.project.update({ where: { id }, data: dto });
  }

  async remove(userId: string, id: string) {
    await this.access.project(userId, id);
    await this.prisma.project.delete({ where: { id } });
    return { ok: true };
  }

  /* metrics */
  async addMetric(userId: string, projectId: string, dto: D.CreateMetricDto) {
    await this.access.project(userId, projectId);
    const last = await this.prisma.metric.aggregate({ where: { projectId }, _max: { order: true } });
    return this.prisma.metric.create({
      data: {
        projectId, name: dto.name, unit: dto.unit ?? '',
        better: dto.better ?? (LOWER_BETTER.test(dto.name) ? 'low' : 'high'),
        order: (last._max.order ?? -1) + 1,
      },
    });
  }
  async updateMetric(userId: string, id: string, dto: D.UpdateMetricDto) {
    await this.access.metric(userId, id);
    return this.prisma.metric.update({ where: { id }, data: dto });
  }
  async removeMetric(userId: string, id: string) {
    await this.access.metric(userId, id);
    await this.prisma.metric.delete({ where: { id } });
    return { ok: true };
  }
  async reorderMetrics(userId: string, projectId: string, ids: string[]) {
    await this.access.project(userId, projectId);
    await this.prisma.$transaction(
      ids.map((id, order) => this.prisma.metric.updateMany({ where: { id, projectId }, data: { order } })),
    );
    return { ok: true };
  }

  /* labels */
  async addLabel(userId: string, projectId: string, dto: D.CreateLabelDto) {
    await this.access.project(userId, projectId);
    const n = await this.prisma.label.count({ where: { projectId } });
    return this.prisma.label.create({ data: { projectId, name: dto.name, color: dto.color ?? PALETTE[n % PALETTE.length] } });
  }
  async updateLabel(userId: string, id: string, dto: D.UpdateLabelDto) {
    await this.access.label(userId, id);
    return this.prisma.label.update({ where: { id }, data: dto });
  }
  async removeLabel(userId: string, id: string) {
    await this.access.label(userId, id);
    await this.prisma.label.delete({ where: { id } });
    return { ok: true };
  }

  /** Dự án mẫu cho người mới: metrics, nhãn, vài task có phụ thuộc và log để xem ngay biểu đồ/graph. */
  async sample(userId: string, lang: 'vi' | 'en' = 'vi') {
    const en = lang === 'en';
    const n = await this.prisma.project.count({ where: { ownerId: userId } });
    const tx = (vi: string, e: string) => (en ? e : vi);
    const day = (d: number) => { const x = new Date(); x.setHours(9, 0, 0, 0); x.setDate(x.getDate() + d); return x; };
    await this.statuses.ensureDefaults(userId);

    const project = await this.prisma.project.create({
      data: {
        ownerId: userId,
        color: PALETTE[n % PALETTE.length],
        title: tx('Dự án mẫu: Phân loại ảnh', 'Sample project: Image classification'),
        description: tx(
          'Dự án mẫu để làm quen: thử vài mô hình, ghi metric và xem phụ thuộc giữa các thí nghiệm. Bạn có thể xóa dự án này bất cứ lúc nào.',
          'A sample project to get you started: try a few models, log metrics and see dependencies between experiments. Delete it any time.',
        ),
        metrics: { create: [
          { name: 'Accuracy', better: 'high', order: 0 },
          { name: 'Loss', better: 'low', order: 1 },
          { name: tx('Thời gian train', 'Training time'), unit: 'h', better: 'low', order: 2 },
        ] },
        labels: { create: [
          { name: 'baseline', color: '#0ea5e9' }, { name: 'ablation', color: '#8b5cf6' }, { name: 'paper', color: '#f59e0b' },
        ] },
      },
      include: { metrics: true, labels: true },
    });
    const M = Object.fromEntries(project.metrics.map((m) => [m.order, m.id]));
    const L = Object.fromEntries(project.labels.map((l) => [l.name, l.id]));
    const mk = (title: string, status: string, labels: string[], dueIn: number | null, desc = '', completed = false) =>
      this.prisma.task.create({
        data: {
          projectId: project.id, title, description: desc, status,
          dueDate: dueIn == null ? null : day(dueIn),
          completedAt: completed ? new Date() : null,
          labels: { connect: labels.map((l) => ({ id: L[l] })) },
        },
      });
    const base = await mk(tx('Baseline: ResNet-18', 'Baseline: ResNet-18'), 'done', ['baseline'], -3, tx('Huấn luyện mô hình cơ sở để làm mốc so sánh.', 'Train a baseline model to compare against.'), true);
    const aug = await mk(tx('Thêm data augmentation', 'Add data augmentation'), 'running', ['ablation'], 2, tx('Thử RandAugment và so sánh với baseline.', 'Try RandAugment and compare with the baseline.'));
    const big = await mk(tx('Thử backbone lớn hơn', 'Try a larger backbone'), 'todo', ['ablation'], 6);
    const rep = await mk(tx('Viết báo cáo kết quả', 'Write up the results'), 'todo', ['paper'], 10);
    const link = (id: string, dep: string) => this.prisma.task.update({ where: { id }, data: { dependsOn: { connect: { id: dep } } } });
    await link(aug.id, base.id); await link(big.id, base.id); await link(rep.id, aug.id); await link(rep.id, big.id);

    const curve = (start: number, end: number, steps: number) =>
      Array.from({ length: steps }, (_, i) => ({ step: i + 1, v: +(end + (start - end) * Math.exp(-i / (steps / 3))).toFixed(4) }));
    const logs = (taskId: string, order: number, c: { step: number; v: number }[], std?: number) =>
      this.prisma.metricLog.createMany({ data: c.map((x) => ({ taskId, metricId: M[order], step: x.step, value: x.v, std: std ?? null })) });
    await logs(base.id, 0, curve(0.55, 0.81, 8), 0.012);
    await logs(base.id, 1, curve(1.4, 0.58, 8));
    await logs(aug.id, 0, curve(0.58, 0.86, 5), 0.01);
    await logs(aug.id, 1, curve(1.3, 0.47, 5));
    await this.prisma.note.create({
      data: { taskId: aug.id, title: tx('Ý tưởng', 'Ideas'), body: tx('- Thử cutmix\n- So sánh với mixup\n- Kiểm tra trên 3 seed', '- Try CutMix\n- Compare with MixUp\n- Check on 3 seeds') },
    });
    return project;
  }
}
