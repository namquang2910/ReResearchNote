import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { CalendarModule } from './calendar/calendar.module';
import { AccessModule } from './common/access.service';
import { AuthGuard, Public } from './common/auth';
import { LibraryModule } from './library/library.module';
import { MailModule } from './mail/mail.module';
import { OverviewController } from './overview/overview.controller';
import { PrismaModule, PrismaService } from './prisma/prisma.module';
import { ProfileModule } from './profile/profile.module';
import { ProjectsModule } from './projects/projects.module';
import { StatusesModule } from './statuses/statuses.module';
import { TasksModule } from './tasks/tasks.module';

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}
  /** Cho load balancer / uptime monitor: kiểm tra cả kết nối DB. */
  @Public() @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true, uptime: Math.round(process.uptime()) };
  }
}

@Module({
  imports: [
    // mặc định 300 request/phút/IP; các endpoint nhạy cảm có giới hạn riêng bằng @Throttle
    // THROTTLE_DISABLED chỉ dùng cho bộ test (nhiều request liên tiếp); không đặt ở production
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }], skipIf: () => process.env.THROTTLE_DISABLED === 'true' }),
    PrismaModule, AccessModule, MailModule, AuthModule, StatusesModule, LibraryModule,
    ProjectsModule, TasksModule, AiModule, CalendarModule, ProfileModule,
  ],
  controllers: [OverviewController, HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: AuthGuard },
  ],
})
export class AppModule {}
