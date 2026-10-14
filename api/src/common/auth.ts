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

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

@Injectable()
export class AuthGuard implements CanActivate {
  /** cache ngắn: tránh truy vấn DB cho mỗi request nhưng tài khoản bị xóa vẫn mất hiệu lực trong ≤30s */
  private alive = new Map<string, number>();

  constructor(private reflector: Reflector, private jwt: JwtService, private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    const bearer = (req.headers.authorization as string | undefined)?.match(/^Bearer (.+)$/)?.[1];
    const token = readCookie(req.headers.cookie, SESSION_COOKIE) ?? bearer;
    if (!token) throw new UnauthorizedException('Chưa đăng nhập');
    let sub: string;
    try { sub = (await this.jwt.verifyAsync<{ sub: string }>(token)).sub; }
    catch { throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn'); }

    const until = this.alive.get(sub);
    if (!until || until < Date.now()) {
      const u = await this.prisma.user.findUnique({ where: { id: sub }, select: { id: true } });
      if (!u) { this.alive.delete(sub); throw new UnauthorizedException('Tài khoản không tồn tại'); }
      this.alive.set(sub, Date.now() + 30_000);
    }
    req.user = { id: sub } satisfies AuthUser;
    return true;
  }

  forget(userId: string) { this.alive.delete(userId); }
}
