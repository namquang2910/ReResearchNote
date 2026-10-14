import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.module';

export const SESSION_COOKIE = 'rn_session';
const IS_PUBLIC = 'isPublic';

/** Cho phép truy cập không cần đăng nhập (đăng ký, đăng nhập, health, feed .ics…). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export interface AuthUser { id: string }
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

@Injectable()
export class AuthGuard implements CanActivate {
  /** cache ngắn: tránh truy vấn DB cho mỗi request; thay đổi quan trọng gọi forget() để hiệu lực ngay */
  private alive = new Map<string, { until: number; validAfter: number }>();

  constructor(private reflector: Reflector, private jwt: JwtService, private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    const bearer = (req.headers.authorization as string | undefined)?.match(/^Bearer (.+)$/)?.[1];
    const token = readCookie(req.headers.cookie, SESSION_COOKIE) ?? bearer;
    if (!token) throw new UnauthorizedException('Chưa đăng nhập');

    let payload: { sub: string; iat?: number; typ?: string };
    try { payload = await this.jwt.verifyAsync(token); }
    catch { throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn'); }
    // vé 2FA (typ = "2fa") chỉ dùng để hoàn tất đăng nhập, không phải phiên
    if (payload.typ && payload.typ !== 'session') throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');

    let entry = this.alive.get(payload.sub);
    if (!entry || entry.until < Date.now()) {
      const u = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, sessionsValidAfter: true } });
      if (!u) { this.alive.delete(payload.sub); throw new UnauthorizedException('Tài khoản không tồn tại'); }
      entry = { until: Date.now() + 30_000, validAfter: u.sessionsValidAfter?.getTime() ?? 0 };
      this.alive.set(payload.sub, entry);
    }
    // đổi / đặt lại mật khẩu làm mọi phiên cấp trước đó mất hiệu lực
    if ((payload.iat ?? 0) * 1000 < entry.validAfter) throw new UnauthorizedException('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');

    req.user = { id: payload.sub } satisfies AuthUser;
    return true;
  }

  forget(userId: string) { this.alive.delete(userId); }
}
