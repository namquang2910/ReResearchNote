import { Global, Injectable, Module, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';

/** Mọi truy cập dữ liệu đều đi qua đây để chắc chắn đúng chủ sở hữu. Không tìm thấy => 404 (không lộ sự tồn tại). */
@Injectable()
export class AccessService {
  constructor(private prisma: PrismaService) {}

  async project(userId: string, id: string) {
    const p = await this.prisma.project.findFirst({ where: { id, ownerId: userId } });
    if (!p) throw new NotFoundException('Project not found');
    return p;
  }
  async task(userId: string, id: string) {
    const t = await this.prisma.task.findFirst({ where: { id, project: { ownerId: userId } } });
    if (!t) throw new NotFoundException('Task not found');
    return t;
  }
  async metric(userId: string, id: string) {
    const m = await this.prisma.metric.findFirst({ where: { id, project: { ownerId: userId } } });
    if (!m) throw new NotFoundException('Metric not found');
    return m;
  }
  async label(userId: string, id: string) {
    const l = await this.prisma.label.findFirst({ where: { id, project: { ownerId: userId } } });
    if (!l) throw new NotFoundException('Label not found');
    return l;
  }
  async feed(userId: string, id: string) {
    const f = await this.prisma.calendarFeed.findFirst({ where: { id, ownerId: userId } });
    if (!f) throw new NotFoundException('Feed not found');
    return f;
  }
}

@Global()
@Module({ providers: [AccessService], exports: [AccessService] })
export class AccessModule {}
