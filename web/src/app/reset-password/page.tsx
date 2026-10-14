'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { t } from '@/lib/i18n';
import { Button, inputCls } from '@/components/ui';
import AuthCard, { ErrorBox, FieldLabel, InfoBox } from '@/components/AuthCard';

function Form() {
  const token = useSearchParams().get('token') ?? '';
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (pw !== pw2) return setError(t('Hai mật khẩu không khớp'));
    setBusy(true);
    try { await api.post('/auth/reset', { token, password: pw }); setDone(true); }
    catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  }

  if (!token) return <AuthCard><ErrorBox>{t('Liên kết đặt lại không hợp lệ hoặc đã hết hạn')}</ErrorBox><Link href="/login" className="text-sm text-primary hover:underline">{t('Quay lại đăng nhập')}</Link></AuthCard>;
  if (done) return (
    <AuthCard>
      <InfoBox>{t('Đã đặt lại mật khẩu. Các phiên đăng nhập cũ đã bị đăng xuất.')}</InfoBox>
      <Link href="/login"><Button variant="primary" className="w-full">{t('Đăng nhập')}</Button></Link>
    </AuthCard>
  );
  return (
    <AuthCard>
      <form onSubmit={submit} className="space-y-4">
        <h1 className="text-lg font-semibold">{t('Đặt lại mật khẩu')}</h1>
        <div><FieldLabel>{t('Mật khẩu mới')}</FieldLabel>
          <input type="password" required minLength={8} autoFocus autoComplete="new-password" className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)} />
          <p className="mt-1.5 text-xs text-muted-fg">{t('Tối thiểu 8 ký tự.')}</p></div>
        <div><FieldLabel>{t('Nhập lại mật khẩu')}</FieldLabel>
          <input type="password" required minLength={8} autoComplete="new-password" className={inputCls} value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
        {error && <ErrorBox>{error}</ErrorBox>}
        <Button variant="primary" type="submit" className="w-full" disabled={busy || pw.length < 8}>{busy ? t('Đang xử lý…') : t('Đặt lại mật khẩu')}</Button>
      </form>
    </AuthCard>
  );
}
export default function ResetPage() { return <Suspense><Form /></Suspense>; }
