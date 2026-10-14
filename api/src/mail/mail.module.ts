import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';

/**
 * Gửi email qua SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM).
 * Chưa cấu hình SMTP: không gửi, chỉ ghi nội dung (kèm liên kết) ra log — tiện cho dev; production nên cấu hình SMTP.
 */
@Injectable()
export class MailService {
  private log = new Logger('Mail');
  private tx?: Transporter;

  get enabled() { return !!process.env.SMTP_HOST; }

  private transport() {
    this.tx ??= createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      tls: process.env.SMTP_TLS_REJECT_UNAUTHORIZED === 'false' ? { rejectUnauthorized: false } : undefined,
    });
    return this.tx;
  }

  async send(to: string, subject: string, text: string) {
    if (!this.enabled) {
      this.log.log(`(SMTP chưa cấu hình) → ${to} | ${subject}\n${text}`);
      return false;
    }
    try {
      await this.transport().sendMail({ from: process.env.MAIL_FROM ?? 'ReSearch <no-reply@localhost>', to, subject, text });
      return true;
    } catch (e: any) {
      this.log.error(`Gửi mail thất bại tới ${to}: ${e?.message ?? e}`);
      return false;
    }
  }
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
