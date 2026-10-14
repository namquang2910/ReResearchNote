import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthGuard } from '../common/auth';
import { decrypt, encrypt, newRecoveryCodes, newTotpSecret, otpauthUrl, randomToken, sha256, verifyTotp } from '../common/crypto';
import { MailService } from '../mail/mail.module';
import { PrismaService } from '../prisma/prisma.module';
import { StatusesService } from '../statuses/statuses.service';

// hash giả để so sánh khi không có user — tránh lộ email nào tồn tại qua thời gian phản hồi
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8y.7s0nQqj6lq5q4jN5nO9n2Zp8sXy';
const HOUR = 3600_000;
type Lang = 'vi' | 'en';
type DbUser = NonNullable<Awaited<ReturnType<PrismaService['user']['findUnique']>>>;

@Injectable()
export class AuthService {
  private log = new Logger('Auth');
  /** đếm số lần nhập sai mã 2FA theo người dùng (chống dò mã) */
  private fails = new Map<string, { n: number; until: number }>();

  constructor(
    private prisma: PrismaService, private jwt: JwtService, private statuses: StatusesService,
    private guard: AuthGuard, private mail: MailService,
  ) {}

  /* ---------- cấu hình công khai cho giao diện ---------- */
  config() {
    return {
      registration: process.env.ALLOW_REGISTRATION !== 'false',
      google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      mail: this.mail.enabled,
      requireVerification: this.requireVerification(),
    };
  }
  requireVerification() { return this.mail.enabled && process.env.REQUIRE_EMAIL_VERIFICATION === 'true'; }
  appUrl() { return (process.env.PUBLIC_URL ?? 'http://localhost:3000').replace(/\/$/, ''); }

  publicUser(u: DbUser) {
    return {
      id: u.id, email: u.email, name: u.name, createdAt: u.createdAt,
      emailVerified: !!u.emailVerifiedAt, totpEnabled: u.totpEnabled, hasPassword: u.passwordSet, googleLinked: !!u.googleId,
    };
  }

  sessionToken(userId: string) { return this.jwt.signAsync({ sub: userId, typ: 'session' }); }
  ticket(userId: string) { return this.jwt.signAsync({ sub: userId, typ: '2fa' }, { expiresIn: '5m' }); }

  /* ---------- token dùng một lần (xác minh email / đặt lại mật khẩu) ---------- */
  private async issue(userId: string, type: 'verify' | 'reset', ttlMs: number) {
    const token = randomToken(32);
    await this.prisma.authToken.create({ data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) } });
    return token;
  }
  private async consume(type: 'verify' | 'reset', token: string) {
    const row = await this.prisma.authToken.findUnique({ where: { tokenHash: sha256(token ?? '') } });
    if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date()) return null;
    // đánh dấu đã dùng nguyên tử: chỉ một request thắng
    const won = await this.prisma.authToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    return won.count === 1 ? row.userId : null;
  }

  private text(lang: Lang, kind: 'verify' | 'reset', link: string) {
    const vi = lang === 'vi';
    if (kind === 'verify') return {
      subject: vi ? 'Xác minh email cho ReSearch' : 'Verify your email for ReSearch',
      text: vi
        ? `Chào bạn,\n\nBấm vào liên kết để xác minh email (có hiệu lực 24 giờ):\n${link}\n\nNếu bạn không tạo tài khoản, hãy bỏ qua email này.`
        : `Hi,\n\nClick the link to verify your email (valid for 24 hours):\n${link}\n\nIf you didn't create an account, ignore this email.`,
    };
    return {
      subject: vi ? 'Đặt lại mật khẩu ReSearch' : 'Reset your ReSearch password',
      text: vi
        ? `Chào bạn,\n\nBấm vào liên kết để đặt lại mật khẩu (có hiệu lực 1 giờ, dùng một lần):\n${link}\n\nNếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu của bạn không đổi.`
        : `Hi,\n\nClick the link to reset your password (valid for 1 hour, single use):\n${link}\n\nIf you didn't ask for this, ignore this email — your password is unchanged.`,
    };
  }

  async sendVerification(user: DbUser, lang: Lang = 'vi') {
    if (user.emailVerifiedAt) return;
    // chống spam: tối đa 1 email / 60 giây cho mỗi tài khoản
    const recent = await this.prisma.authToken.findFirst({ where: { userId: user.id, type: 'verify', createdAt: { gt: new Date(Date.now() - 60_000) } } });
    if (recent) return;
    const token = await this.issue(user.id, 'verify', 24 * HOUR);
    const m = this.text(lang, 'verify', `${this.appUrl()}/verify-email?token=${token}`);
    await this.mail.send(user.email, m.subject, m.text);
  }

  /* ---------- đăng ký / đăng nhập ---------- */
  async register(email: string, password: string, name: string | undefined, lang: Lang = 'vi') {
    if (process.env.ALLOW_REGISTRATION === 'false') throw new ForbiddenException('Đăng ký đang tạm đóng');
    const e = email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email: e } })) throw new ConflictException('Email này đã được đăng ký');
    // không cấu hình mail thì không thể xác minh → coi như đã xác minh
    const user = await this.prisma.user.create({
      data: { email: e, name: name?.trim() ?? '', passwordHash: await bcrypt.hash(password, 10), emailVerifiedAt: this.mail.enabled ? null : new Date() },
    });
    await this.statuses.ensureDefaults(user.id);
    if (this.mail.enabled) await this.sendVerification(user, lang);
    return user;
  }

  /** Trả về user nếu đăng nhập xong, hoặc yêu cầu bước 2FA. */
  async login(email: string, password: string): Promise<{ user: DbUser } | { requires2fa: true; ticket: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    const ok = await bcrypt.compare(password, user && user.passwordSet ? user.passwordHash : DUMMY_HASH);
    if (!user || !user.passwordSet || !ok) throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    return this.afterPrimaryAuth(user);
  }

  /** Dùng chung cho mật khẩu và Google: kiểm tra xác minh email + 2FA. */
  async afterPrimaryAuth(user: DbUser): Promise<{ user: DbUser } | { requires2fa: true; ticket: string }> {
    if (this.requireVerification() && !user.emailVerifiedAt) throw new ForbiddenException('Email chưa được xác minh. Hãy kiểm tra hộp thư của bạn.');
    if (user.totpEnabled) return { requires2fa: true, ticket: await this.ticket(user.id) };
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { user };
  }

  async verifyEmail(token: string) {
    const userId = await this.consume('verify', token);
    if (!userId) throw new BadRequestException('Liên kết xác minh không hợp lệ hoặc đã hết hạn');
    await this.prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    return { ok: true };
  }

  async resendVerification(email: string, lang: Lang) {
    const u = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (u && !u.emailVerifiedAt && this.mail.enabled) await this.sendVerification(u, lang);
    return { ok: true }; // luôn ok: không lộ email nào tồn tại
  }

  /* ---------- quên / đặt lại mật khẩu ---------- */
  async forgot(email: string, lang: Lang) {
    const u = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (u) {
      const recent = await this.prisma.authToken.findFirst({ where: { userId: u.id, type: 'reset', createdAt: { gt: new Date(Date.now() - 60_000) } } });
      if (!recent) {
        const token = await this.issue(u.id, 'reset', HOUR);
        const m = this.text(lang, 'reset', `${this.appUrl()}/reset-password?token=${token}`);
        await this.mail.send(u.email, m.subject, m.text);
      }
    }
    return { ok: true }; // luôn ok: không lộ email nào tồn tại
  }

  async reset(token: string, password: string) {
    const userId = await this.consume('reset', token);
    if (!userId) throw new BadRequestException('Liên kết đặt lại không hợp lệ hoặc đã hết hạn');
    await this.setPassword(userId, password, true);
    // thu hồi mọi liên kết đặt lại còn lại
    await this.prisma.authToken.updateMany({ where: { userId, type: 'reset', usedAt: null }, data: { usedAt: new Date() } });
    return { ok: true };
  }

  /** Đặt mật khẩu mới và thu hồi mọi phiên cũ. */
  private async setPassword(userId: string, password: string, verifyEmail = false) {
    const now = new Date();
    const validAfter = new Date(Math.floor(now.getTime() / 1000) * 1000); // JWT iat là giây
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await bcrypt.hash(password, 10), passwordSet: true, sessionsValidAfter: validAfter,
        ...(verifyEmail ? { emailVerifiedAt: now } : {}),
      },
    });
    this.guard.forget(userId);
  }

  /* ---------- tài khoản ---------- */
  async user(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new UnauthorizedException();
    return u;
  }
  async me(id: string) { return this.publicUser(await this.user(id)); }
  async updateName(id: string, name?: string) {
    return this.publicUser(await this.prisma.user.update({ where: { id }, data: { name: name?.trim() ?? '' } }));
  }

  async changePassword(id: string, current: string | undefined, next: string) {
    const u = await this.user(id);
    if (u.passwordSet && !(await bcrypt.compare(current ?? '', u.passwordHash))) throw new UnauthorizedException('Mật khẩu hiện tại không đúng');
    await this.setPassword(id, next);
    return { ok: true };
  }

  async deleteAccount(id: string, password?: string, email?: string) {
    const u = await this.user(id);
    if (u.passwordSet) {
      if (!(await bcrypt.compare(password ?? '', u.passwordHash))) throw new UnauthorizedException('Mật khẩu không đúng');
    } else if ((email ?? '').trim().toLowerCase() !== u.email) {
      throw new UnauthorizedException('Email xác nhận không khớp');
    }
    await this.prisma.user.delete({ where: { id } }); // cascade toàn bộ dữ liệu
    this.guard.forget(id);
    return { ok: true };
  }

  /* ---------- 2FA (TOTP) ---------- */
  async twoFaSetup(id: string) {
    const u = await this.user(id);
    if (u.totpEnabled) throw new BadRequestException('2FA đã được bật');
    const secret = newTotpSecret();
    await this.prisma.user.update({ where: { id }, data: { totpSecretEnc: encrypt(secret) } });
    return { secret, otpauthUrl: otpauthUrl(u.email, secret) };
  }

  async twoFaEnable(id: string, code: string) {
    const u = await this.user(id);
    if (u.totpEnabled) throw new BadRequestException('2FA đã được bật');
    if (!u.totpSecretEnc) throw new BadRequestException('Hãy bắt đầu cài đặt 2FA trước');
    if (!verifyTotp(decrypt(u.totpSecretEnc), code)) throw new BadRequestException('Mã xác thực không đúng');
    const codes = newRecoveryCodes();
    await this.prisma.user.update({
      where: { id },
      data: { totpEnabled: true, recoveryCodes: codes.map((c) => sha256(c.toLowerCase())) },
    });
    return { recoveryCodes: codes };
  }

  async twoFaDisable(id: string, password?: string, code?: string) {
    const u = await this.user(id);
    if (!u.totpEnabled) throw new BadRequestException('2FA chưa được bật');
    const okPw = u.passwordSet && !!password && (await bcrypt.compare(password, u.passwordHash));
    const okCode = !!code && !!u.totpSecretEnc && verifyTotp(decrypt(u.totpSecretEnc), code);
    if (!okPw && !okCode) throw new UnauthorizedException(u.passwordSet ? 'Mật khẩu không đúng' : 'Mã xác thực không đúng');
    await this.prisma.user.update({ where: { id }, data: { totpEnabled: false, totpSecretEnc: null, recoveryCodes: Prisma.DbNull } });
    return { ok: true };
  }

  async twoFaLogin(ticket: string, code?: string, recoveryCode?: string) {
    let payload: { sub: string; typ?: string };
    try { payload = await this.jwt.verifyAsync(ticket); } catch { throw new UnauthorizedException('Phiên xác thực 2FA đã hết hạn, hãy đăng nhập lại'); }
    if (payload.typ !== '2fa') throw new UnauthorizedException('Phiên xác thực 2FA không hợp lệ');

    const f = this.fails.get(payload.sub);
    if (f && f.n >= 5 && f.until > Date.now()) throw new ForbiddenException('Nhập sai quá nhiều lần, vui lòng thử lại sau ít phút');

    const u = await this.user(payload.sub);
    let ok = false;
    if (code && u.totpSecretEnc) ok = verifyTotp(decrypt(u.totpSecretEnc), code);
    if (!ok && recoveryCode && Array.isArray(u.recoveryCodes)) {
      const h = sha256(recoveryCode.trim().toLowerCase());
      const left = (u.recoveryCodes as string[]);
      if (left.includes(h)) {
        ok = true; // mỗi mã khôi phục chỉ dùng một lần
        await this.prisma.user.update({ where: { id: u.id }, data: { recoveryCodes: left.filter((x) => x !== h) } });
      }
    }
    if (!ok) {
      const cur = this.fails.get(u.id);
      this.fails.set(u.id, { n: (cur && cur.until > Date.now() ? cur.n : 0) + 1, until: Date.now() + 10 * 60_000 });
      throw new UnauthorizedException('Mã xác thực không đúng');
    }
    this.fails.delete(u.id);
    await this.prisma.user.update({ where: { id: u.id }, data: { lastLoginAt: new Date() } });
    return u;
  }

  /* ---------- Google OAuth ---------- */
  googleUrls() {
    return {
      auth: process.env.GOOGLE_AUTH_URL ?? 'https://accounts.google.com/o/oauth2/v2/auth',
      token: process.env.GOOGLE_TOKEN_URL ?? 'https://oauth2.googleapis.com/token',
      userinfo: process.env.GOOGLE_USERINFO_URL ?? 'https://openidconnect.googleapis.com/v1/userinfo',
    };
  }
  googleRedirectUri() { return `${this.appUrl()}/api/auth/google/callback`; }

  googleAuthorizeUrl(state: string) {
    const q = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: this.googleRedirectUri(), response_type: 'code',
      scope: 'openid email profile', state, prompt: 'select_account', access_type: 'online',
    });
    return `${this.googleUrls().auth}?${q}`;
  }

  /** Đổi code lấy thông tin người dùng, rồi tìm/liên kết/tạo tài khoản. */
  async googleSignIn(code: string): Promise<DbUser> {
    const urls = this.googleUrls();
    const tr = await fetch(urls.token, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: this.googleRedirectUri(), grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!tr.ok) throw new UnauthorizedException('Google từ chối mã đăng nhập');
    const { access_token } = (await tr.json()) as { access_token?: string };
    if (!access_token) throw new UnauthorizedException('Google không trả access token');

    // thông tin lấy trực tiếp từ Google bằng access token (kênh TLS tin cậy) thay vì tự giải mã id_token
    const ur = await fetch(urls.userinfo, { headers: { authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(10_000) });
    if (!ur.ok) throw new UnauthorizedException('Không lấy được thông tin từ Google');
    const info = (await ur.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string };
    if (!info.sub || !info.email) throw new UnauthorizedException('Google không trả đủ thông tin');
    if (info.email_verified !== true) throw new UnauthorizedException('Email Google chưa được xác minh');
    const email = info.email.toLowerCase();

    let user = await this.prisma.user.findUnique({ where: { googleId: info.sub } });
    if (!user) {
      const byEmail = await this.prisma.user.findUnique({ where: { email } });
      if (byEmail) {
        // email đã được Google xác minh → an toàn để liên kết
        user = await this.prisma.user.update({ where: { id: byEmail.id }, data: { googleId: info.sub, emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date() } });
      } else {
        if (process.env.ALLOW_REGISTRATION === 'false') throw new ForbiddenException('Đăng ký đang tạm đóng');
        user = await this.prisma.user.create({
          data: { email, name: info.name ?? '', googleId: info.sub, emailVerifiedAt: new Date(), passwordSet: false, passwordHash: await bcrypt.hash(randomToken(32), 10) },
        });
        await this.statuses.ensureDefaults(user.id);
      }
    }
    return user;
  }

  /** Ngắt liên kết Google (chỉ khi còn cách đăng nhập khác). */
  async unlinkGoogle(id: string) {
    const u = await this.user(id);
    if (!u.passwordSet) throw new BadRequestException('Hãy đặt mật khẩu trước khi ngắt liên kết Google');
    await this.prisma.user.update({ where: { id }, data: { googleId: null } });
    return { ok: true };
  }

  /* ---------- xuất dữ liệu ---------- */
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
