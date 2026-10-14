'use client';
import { useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, ShieldCheck, ShieldOff } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/hooks';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button, Card, Modal, inputCls } from './ui';

const Row = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
    <div className="min-w-0 flex-1">
      <div className="text-sm font-medium">{title}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-fg">{hint}</div>}
    </div>
    <div className="flex flex-wrap items-center gap-2">{children}</div>
  </div>
);

export default function SecurityCard() {
  const { user, config, refresh } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  // đổi / đặt mật khẩu
  const [pw, setPw] = useState({ current: '', next: '' });
  // 2FA
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePw, setDisablePw] = useState('');
  const [copied, setCopied] = useState(false);

  if (!user) return null;
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  const startSetup = () => run(async () => {
    const r = await api.post<{ secret: string; otpauthUrl: string }>('/auth/2fa/setup');
    setSetup({ secret: r.secret, qr: await QRCode.toDataURL(r.otpauthUrl, { margin: 1, width: 192 }) });
    setCode('');
  });
  const enable = () => run(async () => {
    const r = await api.post<{ recoveryCodes: string[] }>('/auth/2fa/enable', { code });
    setSetup(null); setCodes(r.recoveryCodes);
    await refresh();
  });
  const disable = () => run(async () => {
    await api.post('/auth/2fa/disable', user.hasPassword ? { password: disablePw } : { code: disablePw });
    setDisableOpen(false); setDisablePw('');
    await refresh();
    toast(t('Đã tắt xác thực hai yếu tố'));
  });
  const savePassword = () => run(async () => {
    await api.post('/auth/password', user.hasPassword ? { current: pw.current, next: pw.next } : { next: pw.next });
    setPw({ current: '', next: '' });
    await refresh();
    toast(t('Đã đổi mật khẩu'));
  });
  const downloadCodes = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`ReSearch — ${user.email}\n\n${(codes ?? []).join('\n')}\n`], { type: 'text/plain' }));
    a.download = 'research-recovery-codes.txt'; a.click();
  };

  return (
    <Card title={t('Bảo mật')}>
      <div className="divide-y">
        <Row title={t('Email')} hint={user.email}>
          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', user.emailVerified ? 'bg-done/10 text-done' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300')}>
            {user.emailVerified ? <><Check size={13} /> {t('Đã xác minh')}</> : t('Chưa xác minh')}
          </span>
          {!user.emailVerified && config?.mail && (
            <Button size="sm" onClick={() => run(async () => { await api.post('/auth/send-verification'); toast(t('Đã gửi email xác minh')); })}>{t('Gửi lại email xác minh')}</Button>
          )}
        </Row>

        <div className="py-4">
          <div className="mb-2 text-sm font-medium">{user.hasPassword ? t('Đổi mật khẩu') : t('Đặt mật khẩu')}</div>
          {!user.hasPassword && <p className="mb-2 text-xs text-muted-fg">{t('Tài khoản của bạn đăng nhập bằng Google. Đặt mật khẩu để có thể đăng nhập bằng email.')}</p>}
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            {user.hasPassword && (
              <input type="password" autoComplete="current-password" placeholder={t('Mật khẩu hiện tại')} className={inputCls} value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            )}
            <input type="password" autoComplete="new-password" placeholder={t('Mật khẩu mới (tối thiểu 8 ký tự)')} className={cn(inputCls, !user.hasPassword && 'sm:col-span-2')}
              value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            <Button disabled={busy || pw.next.length < 8 || (user.hasPassword && !pw.current)} onClick={savePassword}>{user.hasPassword ? t('Đổi mật khẩu') : t('Đặt mật khẩu')}</Button>
          </div>
          <p className="mt-2 text-xs text-muted-fg">{t('Các thiết bị khác sẽ bị đăng xuất khi đổi mật khẩu.')}</p>
        </div>

        <Row title={t('Xác thực hai yếu tố (2FA)')}
          hint={user.totpEnabled ? t('Đang bật: cần mã từ ứng dụng xác thực mỗi lần đăng nhập.') : t('Thêm một lớp bảo vệ bằng ứng dụng như Google Authenticator, 1Password, Authy.')}>
          {user.totpEnabled
            ? <Button size="sm" variant="danger" onClick={() => setDisableOpen(true)}><ShieldOff size={14} /> {t('Tắt 2FA')}</Button>
            : <Button size="sm" variant="primary" disabled={busy} onClick={startSetup}><ShieldCheck size={14} /> {t('Bật 2FA')}</Button>}
        </Row>

        {config?.google && (
          <Row title="Google" hint={user.googleLinked ? t('Đã liên kết — bạn có thể đăng nhập bằng Google.') : t('Liên kết để đăng nhập nhanh bằng tài khoản Google có cùng email.')}>
            {user.googleLinked
              ? <Button size="sm" disabled={!user.hasPassword || busy} title={!user.hasPassword ? t('Hãy đặt mật khẩu trước') : undefined}
                  onClick={() => run(async () => { await api.del('/auth/google'); await refresh(); })}>{t('Ngắt liên kết')}</Button>
              : <a href="/api/auth/google?next=/profile"><Button size="sm">{t('Liên kết Google')}</Button></a>}
          </Row>
        )}
      </div>

      {/* thiết lập 2FA: quét QR + nhập mã */}
      <Modal open={!!setup} onClose={() => setSetup(null)} title={t('Bật xác thực hai yếu tố')}>
        {setup && (
          <div className="space-y-4">
            <p className="text-sm text-muted-fg">{t('1. Quét mã QR bằng ứng dụng xác thực. 2. Nhập mã 6 số hiện ra để xác nhận.')}</p>
            <div className="flex flex-col items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qr} alt="QR" width={192} height={192} className="rounded-lg border bg-white p-1" />
              <code className="break-all rounded bg-muted px-2 py-1 text-xs">{setup.secret}</code>
              <span className="text-xs text-muted-fg">{t('Không quét được? Nhập khóa này thủ công.')}</span>
            </div>
            <input autoFocus inputMode="numeric" autoComplete="one-time-code" placeholder="000000" value={code}
              onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && code.length >= 6 && enable()}
              className={cn(inputCls, 'text-center font-mono text-lg tracking-widest')} />
            <div className="flex justify-end gap-2">
              <Button onClick={() => setSetup(null)}>{t('Hủy')}</Button>
              <Button variant="primary" disabled={busy || code.replace(/\s/g, '').length < 6} onClick={enable}>{t('Xác nhận và bật')}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* mã khôi phục: chỉ hiện một lần */}
      <Modal open={!!codes} onClose={() => setCodes(null)} title={t('Lưu mã khôi phục')}>
        <div className="space-y-4">
          <p className="text-sm text-muted-fg">{t('Nếu mất điện thoại, mỗi mã dưới đây đăng nhập được một lần. Hãy lưu ở nơi an toàn — chúng sẽ không hiển thị lại.')}</p>
          <div className="grid grid-cols-2 gap-2 rounded-xl border bg-bg/60 p-3 font-mono text-sm">
            {codes?.map((c) => <span key={c}>{c}</span>)}
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex gap-2">
              <Button size="sm" onClick={async () => { await navigator.clipboard.writeText((codes ?? []).join('\n')).catch(() => {}); setCopied(true); }}>
                <Copy size={14} /> {copied ? t('Đã chép') : t('Sao chép')}
              </Button>
              <Button size="sm" onClick={downloadCodes}><Download size={14} /> {t('Tải .txt')}</Button>
            </div>
            <Button variant="primary" onClick={() => setCodes(null)}>{t('Tôi đã lưu')}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={disableOpen} onClose={() => setDisableOpen(false)} title={t('Tắt xác thực hai yếu tố')}>
        <div className="space-y-3">
          <p className="text-sm text-muted-fg">{user.hasPassword ? t('Nhập mật khẩu để xác nhận.') : t('Nhập mã 6 số từ ứng dụng xác thực để xác nhận.')}</p>
          <input autoFocus type={user.hasPassword ? 'password' : 'text'} className={inputCls} value={disablePw} onChange={(e) => setDisablePw(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDisableOpen(false)}>{t('Hủy')}</Button>
            <Button variant="danger" disabled={busy || !disablePw} onClick={disable}>{t('Tắt 2FA')}</Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
