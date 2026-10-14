import { Body, Controller, Delete, Get, Post, Patch, Query, Req, Res, ForbiddenException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthUser, CurrentUser, Public, SESSION_COOKIE, readCookie } from '../common/auth';
import { randomToken } from '../common/crypto';
import { AuthService } from './auth.service';

const THIRTY_DAYS = 30 * 24 * 3600 * 1000;
const TFA_COOKIE = 'rn_2fa';
const OAUTH_COOKIE = 'rn_oauth';
const PW = { message: 'Mật khẩu tối thiểu 8 ký tự' };

export class RegisterDto {
  @IsEmail() @MaxLength(200) email: string;
  @IsString() @MinLength(8, PW) @MaxLength(200) password: string;
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsIn(['vi', 'en']) lang?: 'vi' | 'en';
}
export class LoginDto {
  @IsEmail() email: string;
  @IsString() @MaxLength(200) password: string;
}
export class EmailDto {
  @IsEmail() email: string;
  @IsOptional() @IsIn(['vi', 'en']) lang?: 'vi' | 'en';
}
export class TokenDto { @IsString() @MaxLength(200) token: string; }
export class ResetDto {
  @IsString() @MaxLength(200) token: string;
  @IsString() @MinLength(8, PW) @MaxLength(200) password: string;
}
export class UpdateMeDto { @IsOptional() @IsString() @MaxLength(100) name?: string; }
export class PasswordDto {
  @IsOptional() @IsString() current?: string;
  @IsString() @MinLength(8, PW) @MaxLength(200) next: string;
}
export class DeleteAccountDto {
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsString() email?: string;
}
export class CodeDto { @IsString() @MaxLength(20) code: string; }
export class TwoFaLoginDto {
  @IsOptional() @IsString() ticket?: string;
  @IsOptional() @IsString() @MaxLength(20) code?: string;
  @IsOptional() @IsString() @MaxLength(30) recoveryCode?: string;
}
export class TwoFaDisableDto {
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsString() @MaxLength(20) code?: string;
}

const secureCookie = () => (process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production');
const baseCookie = () => ({ httpOnly: true, sameSite: 'lax' as const, secure: secureCookie(), path: '/' });
const internalPath = (p?: string) => (p && p.startsWith('/') && !p.startsWith('//') ? p : '/');

@Controller('auth')
export class AuthController {
  constructor(private s: AuthService) {}

  private async startSession(res: any, userId: string) {
    res.cookie(SESSION_COOKIE, await this.s.sessionToken(userId), { ...baseCookie(), maxAge: THIRTY_DAYS });
  }
  private clear(res: any, name: string) { res.clearCookie(name, baseCookie()); }

  @Public() @Get('config') config() { return this.s.config(); }

  /* ---- đăng ký / đăng nhập ---- */
  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: any) {
    const u = await this.s.register(dto.email, dto.password, dto.name, dto.lang);
    if (this.s.requireVerification()) return { needsVerification: true, email: u.email };
    await this.startSession(res, u.id);
    return this.s.publicUser(u);
  }

  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: any) {
    const r = await this.s.login(dto.email, dto.password);
    if ('requires2fa' in r) return r; // { requires2fa, ticket }
    await this.startSession(res, r.user.id);
    return this.s.publicUser(r.user);
  }

  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('2fa/login')
  async twoFaLogin(@Body() dto: TwoFaLoginDto, @Req() req: any, @Res({ passthrough: true }) res: any) {
    const ticket = dto.ticket ?? readCookie(req.headers.cookie, TFA_COOKIE) ?? '';
    const u = await this.s.twoFaLogin(ticket, dto.code, dto.recoveryCode);
    this.clear(res, TFA_COOKIE);
    await this.startSession(res, u.id);
    return this.s.publicUser(u);
  }

  @Public()
  @Post('logout')
  logout(@Res({ passthrough: true }) res: any) {
    this.clear(res, SESSION_COOKIE);
    return { ok: true };
  }

  /* ---- xác minh email / quên mật khẩu ---- */
  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-email') verify(@Body() dto: TokenDto) { return this.s.verifyEmail(dto.token); }

  @Public() @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('resend-verification') resend(@Body() dto: EmailDto) { return this.s.resendVerification(dto.email, dto.lang ?? 'vi'); }

  @Public() @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot') forgot(@Body() dto: EmailDto) { return this.s.forgot(dto.email, dto.lang ?? 'vi'); }

  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('reset') reset(@Body() dto: ResetDto) { return this.s.reset(dto.token, dto.password); }

  /* ---- Google ---- */
  @Public()
  @Get('google')
  google(@Query('next') next: string | undefined, @Res() res: any) {
    if (!this.s.config().google) throw new ForbiddenException('Đăng nhập Google chưa được cấu hình');
    const state = randomToken(16);
    res.cookie(OAUTH_COOKIE, `${state}|${encodeURIComponent(internalPath(next))}`, { ...baseCookie(), maxAge: 10 * 60_000 });
    res.redirect(302, this.s.googleAuthorizeUrl(state));
  }

  @Public() @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('google/callback')
  async googleCallback(@Query('code') code: string, @Query('state') state: string, @Query('error') error: string, @Req() req: any, @Res() res: any) {
    const raw = readCookie(req.headers.cookie, OAUTH_COOKIE) ?? '';
    const [expected, next] = raw.split('|');
    this.clear(res, OAUTH_COOKIE);
    const fail = (why: string) => res.redirect(302, `/login?error=${why}`);
    if (error || !code) return fail('google_cancelled');
    // so khớp state chống CSRF
    if (!expected || !state || expected !== state) return fail('google_state');
    try {
      const user = await this.s.googleSignIn(code);
      const r = await this.s.afterPrimaryAuth(user);
      if ('requires2fa' in r) {
        res.cookie(TFA_COOKIE, r.ticket, { ...baseCookie(), maxAge: 5 * 60_000 });
        return res.redirect(302, `/login?twofa=1&next=${encodeURIComponent(internalPath(decodeURIComponent(next ?? '/')))}`);
      }
      await this.startSession(res, r.user.id);
      return res.redirect(302, internalPath(decodeURIComponent(next ?? '/')));
    } catch (e: any) {
      return fail(e?.status === 403 ? 'google_closed' : 'google_failed');
    }
  }

  @Delete('google')
  unlinkGoogle(@CurrentUser() u: AuthUser) { return this.s.unlinkGoogle(u.id); }

  /* ---- tài khoản ---- */
  @Get('me') me(@CurrentUser() u: AuthUser) { return this.s.me(u.id); }
  @Patch('me') update(@CurrentUser() u: AuthUser, @Body() dto: UpdateMeDto) { return this.s.updateName(u.id, dto.name); }

  @Post('send-verification')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async sendVerification(@CurrentUser() u: AuthUser) {
    await this.s.sendVerification(await this.s.user(u.id));
    return { ok: true };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password')
  async password(@CurrentUser() u: AuthUser, @Body() dto: PasswordDto, @Res({ passthrough: true }) res: any) {
    const r = await this.s.changePassword(u.id, dto.current, dto.next);
    await this.startSession(res, u.id); // các phiên khác bị thu hồi; phiên hiện tại được cấp lại
    return r;
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Delete('me')
  async remove(@CurrentUser() u: AuthUser, @Body() dto: DeleteAccountDto, @Res({ passthrough: true }) res: any) {
    const r = await this.s.deleteAccount(u.id, dto.password, dto.email);
    this.clear(res, SESSION_COOKIE);
    return r;
  }

  /* ---- 2FA ---- */
  @Post('2fa/setup') setup(@CurrentUser() u: AuthUser) { return this.s.twoFaSetup(u.id); }
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('2fa/enable') enable(@CurrentUser() u: AuthUser, @Body() dto: CodeDto) { return this.s.twoFaEnable(u.id, dto.code); }
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('2fa/disable') disable(@CurrentUser() u: AuthUser, @Body() dto: TwoFaDisableDto) { return this.s.twoFaDisable(u.id, dto.password, dto.code); }

  @Get('export') export(@CurrentUser() u: AuthUser) { return this.s.export(u.id); }
}
