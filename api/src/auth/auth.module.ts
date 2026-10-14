import { Body, ConflictException, Controller, Delete, ForbiddenException, Get, Injectable, Module, Patch, Post, Res, UnauthorizedException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { AuthGuard, AuthUser, CurrentUser, Public, SESSION_COOKIE } from '../common/auth';
import { PrismaService } from '../prisma/prisma.module';
import { StatusesService } from '../statuses/statuses.service';

const THIRTY_DAYS = 30 * 24 * 3600 * 1000;

export class RegisterDto {
  @IsEmail() @MaxLength(200) email: string;
  @IsString() @MinLength(8, { message: 'Mật khẩu tối thiểu 8 ký tự' }) @MaxLength(200) password: string;
  @IsOptional() @IsString() @MaxLength(100) name?: string;
}
export class LoginDto {
  @IsEmail() email: string;
  @IsString() @MaxLength(200) password: string;
}
export class UpdateMeDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
}
export class PasswordDto {
  @IsString() current: string;
  @IsString() @MinLength(8, { message: 'Mật khẩu tối thiểu 8 ký tự' }) @MaxLength(200) next: string;
}
export class DeleteAccountDto {
  @IsString() password: string;
}

// hash giả để so sánh khi không có user — tránh lộ email nào tồn tại qua thời gian phản hồi
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8y.7s0nQqj6lq5q4jN5nO9n2Zp8sXy';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private statuses: StatusesService, private guard: AuthGuard) {}

  private pub(u: { id: string; email: string; name: string; createdAt: Date }) {
    return { id: u.id, email: u.email, name: u.name, createdAt: u.createdAt };
  }
  token(userId: string) { return this.jwt.signAsync({ sub: userId }); }

  async register(dto: RegisterDto) {
    if (process.env.ALLOW_REGISTRATION === 'false') throw new ForbiddenException('Đăng ký đang tạm đóng');
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Email này đã được đăng ký');
    const user = await this.prisma.user.create({
      data: { email, name: dto.name?.trim() ?? '', passwordHash: await bcrypt.hash(dto.password, 10) },
    });
    await this.statuses.ensureDefaults(user.id);
    return user;
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.trim().toLowerCase() } });
    const ok = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return user;
  }

  async me(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new UnauthorizedException();
    return this.pub(u);
  }
  async updateMe(id: string, dto: UpdateMeDto) {
    return this.pub(await this.prisma.user.update({ where: { id }, data: { name: dto.name?.trim() ?? '' } }));
  }

  async changePassword(id: string, dto: PasswordDto) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u || !(await bcrypt.compare(dto.current, u.passwordHash))) throw new UnauthorizedException('Mật khẩu hiện tại không đúng');
    await this.prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(dto.next, 10) } });
    return { ok: true };
  }

  async deleteAccount(id: string, password: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u || !(await bcrypt.compare(password, u.passwordHash))) throw new UnauthorizedException('Mật khẩu không đúng');
    await this.prisma.user.delete({ where: { id } }); // cascade toàn bộ dữ liệu
    this.guard.forget(id);
    return { ok: true };
  }

  /** Xuất toàn bộ dữ liệu của người dùng (JSON). */
  async export(id: string) {
    const [user, statuses, projects] = await Promise.all([
      this.prisma.user.findUnique({ where: { id }, select: { email: true, name: true, createdAt: true } }),
      this.prisma.status.findMany({ where: { ownerId: id }, orderBy: { order: 'asc' } }),
      this.prisma.project.findMany({
        where: { ownerId: id },
        include: {
          metrics: { orderBy: { order: 'asc' } },
          labels: true,
          tasks: {
            include: {
              labels: { select: { id: true } }, dependsOn: { select: { id: true } },
              logs: true, changes: true, commits: true, comments: true, notes: true,
            },
          },
        },
      }),
    ]);
    return { exportedAt: new Date().toISOString(), version: 1, user, statuses, projects };
  }
}

const cookieOpts = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
  maxAge: THIRTY_DAYS,
  path: '/',
});

@Controller('auth')
export class AuthController {
  constructor(private s: AuthService) {}

  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: any) {
    const u = await this.s.register(dto);
    res.cookie(SESSION_COOKIE, await this.s.token(u.id), cookieOpts());
    return this.s.me(u.id);
  }

  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: any) {
    const u = await this.s.login(dto);
    res.cookie(SESSION_COOKIE, await this.s.token(u.id), cookieOpts());
    return this.s.me(u.id);
  }

  @Public()
  @Post('logout')
  logout(@Res({ passthrough: true }) res: any) {
    res.clearCookie(SESSION_COOKIE, { ...cookieOpts(), maxAge: undefined });
    return { ok: true };
  }

  @Get('me') me(@CurrentUser() u: AuthUser) { return this.s.me(u.id); }
  @Patch('me') update(@CurrentUser() u: AuthUser, @Body() dto: UpdateMeDto) { return this.s.updateMe(u.id, dto); }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password') password(@CurrentUser() u: AuthUser, @Body() dto: PasswordDto) { return this.s.changePassword(u.id, dto); }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Delete('me')
  async remove(@CurrentUser() u: AuthUser, @Body() dto: DeleteAccountDto, @Res({ passthrough: true }) res: any) {
    const r = await this.s.deleteAccount(u.id, dto.password);
    res.clearCookie(SESSION_COOKIE, { ...cookieOpts(), maxAge: undefined });
    return r;
  }

  @Get('export') export(@CurrentUser() u: AuthUser) { return this.s.export(u.id); }
}

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (process.env.NODE_ENV === 'production' && (!secret || secret.length < 32 || secret.startsWith('dev-only'))) {
          throw new Error('JWT_SECRET phải được đặt (>= 32 ký tự, không dùng giá trị dev) ở production. Tạo bằng: openssl rand -hex 32');
        }
        return { secret: secret ?? 'dev-only-change-me-dev-only-change-me', signOptions: { expiresIn: '30d' } };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthGuard, AuthService],
})
export class AuthModule {}
