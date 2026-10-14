import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../common/auth';
import { PrismaService } from '../prisma/prisma.module';

export interface LibraryEntry {
  id: string; // `${type}:${tên viết thường}`
  type: 'label' | 'metric';
  name: string;
  color: string | null;
  unit: string | null;
  better: string | null;
  /** số dự án đang dùng */
  usedIn: number;
  projects: string[];
}

/**
 * Thư viện dùng lại = tổng hợp các nhãn / metric duy nhất (theo tên, không phân biệt hoa thường)
 * từ mọi dự án CỦA NGƯỜI DÙNG. Không có bảng riêng nên luôn khớp với dữ liệu thật.
 */
@Injectable()
export class LibraryService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string): Promise<LibraryEntry[]> {
    const where = { project: { ownerId: userId } };
    const [labels, metrics] = await Promise.all([
      this.prisma.label.findMany({ where, include: { project: { select: { id: true, title: true } } } }),
      this.prisma.metric.findMany({ where, orderBy: { order: 'asc' }, include: { project: { select: { id: true, title: true } } } }),
    ]);

    const mode = (vals: (string | null)[]) => {
      const c = new Map<string, number>();
      vals.forEach((v) => v != null && v !== '' && c.set(v, (c.get(v) ?? 0) + 1));
      return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    };
    const group = <T extends { name: string }>(rows: T[]) => {
      const m = new Map<string, T[]>();
      rows.forEach((r) => { const k = r.name.trim().toLowerCase(); m.set(k, [...(m.get(k) ?? []), r]); });
      return m;
    };
    const out: LibraryEntry[] = [];
    for (const [key, rows] of group(labels)) {
      out.push({
        id: `label:${key}`, type: 'label', name: rows[0].name, unit: null, better: null,
        color: mode(rows.map((r) => r.color)),
        projects: [...new Set(rows.map((r) => r.project.title))], usedIn: new Set(rows.map((r) => r.project.id)).size,
      });
    }
    for (const [key, rows] of group(metrics)) {
      out.push({
        id: `metric:${key}`, type: 'metric', name: rows[0].name, color: null,
        unit: mode(rows.map((r) => r.unit)) ?? '', better: mode(rows.map((r) => r.better)) ?? 'high',
        projects: [...new Set(rows.map((r) => r.project.title))], usedIn: new Set(rows.map((r) => r.project.id)).size,
      });
    }
    return out.sort((a, b) => b.usedIn - a.usedIn || a.name.localeCompare(b.name));
  }
}

@Controller('library')
export class LibraryController {
  constructor(private s: LibraryService) {}
  @Get() list(@CurrentUser() u: AuthUser) { return this.s.list(u.id); }
}

@Module({ controllers: [LibraryController], providers: [LibraryService], exports: [LibraryService] })
export class LibraryModule {}
