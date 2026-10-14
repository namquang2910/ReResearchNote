import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.module';

export const KINDS = ['todo', 'running', 'blocked', 'done'];

export class CreateStatusDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsIn(KINDS) kind?: string;
}
export class UpdateStatusDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsIn(KINDS) kind?: string;
}
export class ReorderStatusesDto {
  @IsArray() @IsString({ each: true }) ids: string[];
}

const DEFAULTS = [
  { key: 'todo', name: 'Chưa làm', color: '#94a3b8', kind: 'todo' },
  { key: 'running', name: 'Đang chạy', color: '#3b82f6', kind: 'running' },
  { key: 'blocked', name: 'Bị chặn', color: '#ef4444', kind: 'blocked' },
  { key: 'done', name: 'Hoàn thành', color: '#22c55e', kind: 'done' },
];

/** Trạng thái là dữ liệu riêng của từng người dùng. */
@Injectable()
export class StatusesService {
  constructor(private prisma: PrismaService) {}

  /** Tạo 4 trạng thái mặc định nếu người dùng chưa có (gọi khi đăng ký). */
  async ensureDefaults(userId: string) {
    if ((await this.prisma.status.count({ where: { ownerId: userId } })) > 0) return;
    await this.prisma.status.createMany({ data: DEFAULTS.map((d, order) => ({ ...d, order, ownerId: userId })), skipDuplicates: true });
  }

  async list(userId: string) {
    const rows = await this.prisma.status.findMany({ where: { ownerId: userId }, orderBy: { order: 'asc' } });
    if (rows.length) return rows; // đường nhanh: 1 truy vấn
    await this.ensureDefaults(userId);
    return this.prisma.status.findMany({ where: { ownerId: userId }, orderBy: { order: 'asc' } });
  }

  /** key -> kind */
  async kinds(userId: string) {
    return new Map((await this.list(userId)).map((s) => [s.key, s.kind] as [string, string]));
  }

  async assertKey(userId: string, key: string) {
    if (!(await this.prisma.status.findUnique({ where: { ownerId_key: { ownerId: userId, key } } })))
      throw new BadRequestException(`Trạng thái "${key}" không tồn tại`);
  }

  private async own(userId: string, id: string) {
    const s = await this.prisma.status.findFirst({ where: { id, ownerId: userId } });
    if (!s) throw new NotFoundException();
    return s;
  }

  /** Luôn phải còn ít nhất một trạng thái loại todo và một loại done. */
  private async assertCoverage(userId: string, exceptId: string, newKind?: string) {
    const rest = (await this.list(userId)).map((s) => (s.id === exceptId ? { ...s, kind: newKind ?? null } : s));
    for (const k of ['todo', 'done']) {
      if (!rest.some((s) => s.kind === k))
        throw new BadRequestException(`Cần giữ ít nhất một trạng thái loại "${k === 'todo' ? 'Chưa làm' : 'Hoàn thành'}"`);
    }
  }

  async create(userId: string, dto: CreateStatusDto) {
    const last = await this.prisma.status.aggregate({ where: { ownerId: userId }, _max: { order: true } });
    return this.prisma.status.create({
      data: {
        ownerId: userId,
        key: 's_' + Math.random().toString(36).slice(2, 9),
        name: dto.name,
        color: dto.color ?? '#a855f7',
        kind: dto.kind ?? 'todo',
        order: (last._max.order ?? -1) + 1,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateStatusDto) {
    const cur = await this.own(userId, id);
    if (dto.kind && dto.kind !== cur.kind) {
      await this.assertCoverage(userId, id, dto.kind);
      const mine = { project: { ownerId: userId }, status: cur.key };
      if (dto.kind === 'done') {
        const rows = await this.prisma.task.findMany({ where: { ...mine, completedAt: null }, select: { id: true, updatedAt: true } });
        for (const r of rows) await this.prisma.task.update({ where: { id: r.id }, data: { completedAt: r.updatedAt } });
      } else if (cur.kind === 'done') {
        await this.prisma.task.updateMany({ where: mine, data: { completedAt: null } });
      }
    }
    return this.prisma.status.update({ where: { id }, data: dto });
  }

  async remove(userId: string, id: string, moveTo?: string) {
    const cur = await this.own(userId, id);
    await this.assertCoverage(userId, id);
    const mine = { project: { ownerId: userId }, status: cur.key };
    const used = await this.prisma.task.count({ where: mine });
    if (used > 0) {
      if (!moveTo || moveTo === cur.key) {
        throw new BadRequestException(`Có ${used} task đang dùng trạng thái này, hãy chọn trạng thái để chuyển sang`);
      }
      await this.assertKey(userId, moveTo);
      const kinds = await this.kinds(userId);
      const wasDone = cur.kind === 'done';
      const nowDone = kinds.get(moveTo) === 'done';
      await this.prisma.task.updateMany({
        where: mine,
        data: {
          status: moveTo,
          ...(wasDone && !nowDone ? { completedAt: null } : {}),
          ...(!wasDone && nowDone ? { completedAt: new Date() } : {}),
        },
      });
    }
    await this.prisma.status.delete({ where: { id } });
    return { ok: true, moved: used };
  }

  async reorder(userId: string, ids: string[]) {
    const mine = await this.prisma.status.findMany({ where: { ownerId: userId, id: { in: ids } }, select: { id: true } });
    const ok = new Set(mine.map((m) => m.id));
    await this.prisma.$transaction(
      ids.filter((i) => ok.has(i)).map((id, order) => this.prisma.status.update({ where: { id }, data: { order } })),
    );
    return { ok: true };
  }
}
