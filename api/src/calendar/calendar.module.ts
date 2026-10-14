import { randomBytes } from 'crypto';
import { networkInterfaces } from 'os';
import { Body, Controller, Delete, Get, Header, Injectable, Module, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { AccessService } from '../common/access.service';
import { AuthUser, CurrentUser, Public } from '../common/auth';
import { PrismaService } from '../prisma/prisma.module';
import { StatusesService } from '../statuses/statuses.service';
import { buildIcs } from './ics';

export class CreateFeedDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() projectId?: string | null;
  @IsOptional() @IsBoolean() includeDone?: boolean;
}
export class UpdateFeedDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsBoolean() includeDone?: boolean;
}

const newToken = () => randomBytes(24).toString('hex');

@Injectable()
export class CalendarService {
  constructor(private prisma: PrismaService, private statuses: StatusesService, private access: AccessService) {}

  /** Địa chỉ mà thiết bị khác dùng để đăng ký lịch. Production: PUBLIC_URL (https). Dev: localhost + địa chỉ LAN. */
  bases() {
    const out: { label: string; url: string; kind: 'local' | 'lan' | 'public' }[] = [];
    if (process.env.PUBLIC_URL) out.push({ label: 'Công khai', url: process.env.PUBLIC_URL.replace(/\/$/, ''), kind: 'public' });
    if (process.env.NODE_ENV !== 'production') {
      const port = process.env.PORT ?? '4000';
      out.push({ label: 'Máy này', url: `http://localhost:${port}`, kind: 'local' });
      for (const list of Object.values(networkInterfaces())) {
        for (const i of list ?? []) {
          if (i.family === 'IPv4' && !i.internal) out.push({ label: `Mạng LAN (${i.address})`, url: `http://${i.address}:${port}`, kind: 'lan' });
        }
      }
    }
    return out;
  }

  async list(userId: string) {
    const feeds = await this.prisma.calendarFeed.findMany({
      where: { ownerId: userId }, orderBy: { createdAt: 'asc' }, include: { project: { select: { title: true } } },
    });
    return {
      bases: this.bases(),
      feeds: feeds.map(({ project, ownerId: _o, ...f }) => ({ ...f, projectTitle: project?.title ?? null, path: `/api/calendar/feed/${f.token}.ics` })),
    };
  }

  async create(userId: string, dto: CreateFeedDto) {
    if (dto.projectId) await this.access.project(userId, dto.projectId);
    return this.prisma.calendarFeed.create({
      data: { ownerId: userId, token: newToken(), name: dto.name?.trim() || 'Lịch ReSearch', projectId: dto.projectId || null, includeDone: dto.includeDone ?? true },
    });
  }
  async update(userId: string, id: string, dto: UpdateFeedDto) {
    await this.access.feed(userId, id);
    return this.prisma.calendarFeed.update({ where: { id }, data: dto });
  }
  /** Đổi token: link cũ ngừng hoạt động. */
  async regenerate(userId: string, id: string) {
    await this.access.feed(userId, id);
    return this.prisma.calendarFeed.update({ where: { id }, data: { token: newToken() } });
  }
  async remove(userId: string, id: string) {
    await this.access.feed(userId, id);
    await this.prisma.calendarFeed.delete({ where: { id } });
    return { ok: true };
  }

  /** Công khai: người sở hữu token chính là người được xem (token 192 bit không đoán được). */
  async ics(token: string) {
    const feed = await this.prisma.calendarFeed.findUnique({ where: { token }, include: { project: { select: { title: true } } } });
    if (!feed) throw new NotFoundException();
    const kinds = await this.statuses.list(feed.ownerId);
    const kindOf = new Map(kinds.map((s) => [s.key, s]));
    const web = (process.env.PUBLIC_URL ?? 'http://localhost:3000').replace(/\/$/, '');

    const rows = await this.prisma.task.findMany({
      where: { dueDate: { not: null }, project: { ownerId: feed.ownerId }, ...(feed.projectId ? { projectId: feed.projectId } : {}) },
      orderBy: { dueDate: 'asc' },
      include: { project: { select: { title: true } }, labels: { select: { name: true } } },
    });
    const tasks = rows
      .map((t) => ({ t, st: kindOf.get(t.status) }))
      .filter(({ st }) => feed.includeDone || st?.kind !== 'done')
      .map(({ t, st }) => ({
        id: t.id, title: t.title, description: t.description, statusName: st?.name ?? t.status, done: st?.kind === 'done',
        dueDate: t.dueDate!, updatedAt: t.updatedAt, projectTitle: t.project.title, labels: t.labels.map((l) => l.name),
        url: `${web}/projects/${t.projectId}?task=${t.id}`,
      }));
    return buildIcs(feed.name + (feed.project ? ` · ${feed.project.title}` : ''), tasks);
  }
}

@Controller('calendar')
export class CalendarController {
  constructor(private s: CalendarService) {}

  @Get('feeds') list(@CurrentUser() u: AuthUser) { return this.s.list(u.id); }
  @Post('feeds') create(@CurrentUser() u: AuthUser, @Body() dto: CreateFeedDto) { return this.s.create(u.id, dto); }
  @Patch('feeds/:id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateFeedDto) { return this.s.update(u.id, id, dto); }
  @Post('feeds/:id/regenerate') regenerate(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.s.regenerate(u.id, id); }
  @Delete('feeds/:id') remove(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.s.remove(u.id, id); }

  @Public()
  @Get('feed/:file')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Cache-Control', 'no-cache, max-age=0')
  @Header('Content-Disposition', 'inline; filename="research-notes.ics"')
  feed(@Param('file') file: string) { return this.s.ics(file.replace(/\.ics$/i, '')); }
}

@Module({ controllers: [CalendarController], providers: [CalendarService] })
export class CalendarModule {}
