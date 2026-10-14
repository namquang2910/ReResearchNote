'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { usePrefs } from '@/lib/prefs';
import { cn } from '@/lib/utils';
import { Button, inputCls } from '@/components/ui';
import AuthCard, { ErrorBox, FieldLabel, InfoBox } from '@/components/AuthCard';

type Mode = 'login' | 'register' | 'forgot' | '2fa' | 'verify';

const GOOGLE_ERRORS: Record<string, string> = {
  google_cancelled: 'Bạn đã hủy đăng nhập Google.',
  google_state: 'Phiên đăng nhập Google không hợp lệ, hãy thử lại.',
  google_failed: 'Đăng nhập Google thất bại. Hãy thử lại hoặc dùng email và mật khẩu.',
  google_closed: 'Đăng ký tài khoản mới đang tạm đóng.',
};

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function AuthFlow() {
  const { user, loading, config, login, twoFaLogin, register } = useAuth();
  const { lang } = usePrefs();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [ticket, setTicket] = useState<string | undefined>();
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const next = () => {
    const n = new URLSearchParams(window.location.search).get('next') ?? '/';
    return n.startsWith('/') && !n.startsWith('//') ? n : '/'; // chỉ chuyển hướng nội bộ
  };

  // quay lại từ Google: báo lỗi hoặc chuyển sang bước 2FA (vé nằm trong cookie HttpOnly)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const err = q.get('error');
    if (err && GOOGLE_ERRORS[err]) setError(t(GOOGLE_ERRORS[err]));
    if (q.get('twofa') === '1') setMode('2fa');
  }, []);
  useEffect(() => { if (!loading && user) router.replace(next()); }, [loading, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setInfo(''); setBusy(true);
    try {
      if (mode === 'login') {
        const r = await login(email.trim(), password);
        if (r.status === 'needs2fa') { setTicket(r.ticket); setMode('2fa'); setCode(''); }
        else router.replace(next());
      } else if (mode === 'register') {
        const r = await register(email.trim(), password, name.trim(), lang);
        if (r.status === 'needsVerification') { setMode('verify'); }
        else router.replace(next());
      } else if (mode === 'forgot') {
        await api.post('/auth/forgot', { email: email.trim(), lang });
        setInfo(t('Nếu email này có tài khoản, chúng tôi đã gửi liên kết đặt lại mật khẩu. Hãy kiểm tra hộp thư.'));
      } else if (mode === '2fa') {
        await twoFaLogin(useRecovery ? { ticket, recoveryCode: code.trim() } : { ticket, code: code.trim() });
        router.replace(next());
      }
    } catch (err: any) {
      setError(err.message ?? t('Có lỗi'));
    } finally {
      setBusy(false);
    }
  }

  const switchTo = (m: Mode) => { setMode(m); setError(''); setInfo(''); };

  if (mode === 'verify') {
    return (
      <AuthCard>
        <h1 className="text-lg font-semibold">{t('Kiểm tra hộp thư của bạn')}</h1>
        <p className="text-sm text-muted-fg">{t('Chúng tôi đã gửi liên kết xác minh tới {email}. Bấm vào liên kết để kích hoạt tài khoản, rồi đăng nhập.', { email })}</p>
        {info && <InfoBox>{info}</InfoBox>}
        <Button className="w-full" onClick={async () => { await api.post('/auth/resend-verification', { email, lang }); setInfo(t('Đã gửi lại (nếu chưa quá hạn mức gửi).')); }}>
          {t('Gửi lại email xác minh')}
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => switchTo('login')}>{t('Quay lại đăng nhập')}</Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <form onSubmit={submit} className="space-y-4">
        {(mode === 'login' || mode === 'register') && (
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 text-sm font-medium">
            {(['login', 'register'] as const).map((m) => (
              <button key={m} type="button" onClick={() => switchTo(m)}
                className={cn('rounded-lg py-2 transition', mode === m ? 'bg-card shadow-card' : 'text-muted-fg hover:text-fg')}>
                {m === 'login' ? t('Đăng nhập') : t('Tạo tài khoản')}
              </button>
            ))}
          </div>
        )}
        {mode === 'forgot' && (
          <div>
            <h1 className="text-lg font-semibold">{t('Quên mật khẩu')}</h1>
            <p className="mt-1 text-sm text-muted-fg">{t('Nhập email của bạn, chúng tôi sẽ gửi liên kết đặt lại mật khẩu.')}</p>
          </div>
        )}
        {mode === '2fa' && (
          <div>
            <h1 className="text-lg font-semibold">{t('Xác thực hai yếu tố')}</h1>
            <p className="mt-1 text-sm text-muted-fg">
              {useRecovery ? t('Nhập một mã khôi phục (mỗi mã chỉ dùng một lần).') : t('Nhập mã 6 số từ ứng dụng xác thực của bạn.')}
            </p>
          </div>
        )}

        {mode === 'register' && (
          <div>
            <FieldLabel>{t('Tên hiển thị')}</FieldLabel>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
        )}
        {mode !== '2fa' && (
          <div>
            <FieldLabel>Email</FieldLabel>
            <input type="email" required autoFocus className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
        )}
        {(mode === 'login' || mode === 'register') && (
          <div>
            <FieldLabel>{t('Mật khẩu')}</FieldLabel>
            <input type="password" required minLength={mode === 'register' ? 8 : undefined} className={inputCls} value={password}
              onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            {mode === 'register' && <p className="mt-1.5 text-xs text-muted-fg">{t('Tối thiểu 8 ký tự.')}</p>}
            {mode === 'login' && (
              <button type="button" onClick={() => switchTo('forgot')} className="mt-2 text-xs font-medium text-primary hover:underline">{t('Quên mật khẩu?')}</button>
            )}
          </div>
        )}
        {mode === '2fa' && (
          <div>
            <FieldLabel>{useRecovery ? t('Mã khôi phục') : t('Mã xác thực')}</FieldLabel>
            <input autoFocus required inputMode={useRecovery ? 'text' : 'numeric'} autoComplete="one-time-code"
              className={cn(inputCls, 'text-center font-mono text-lg tracking-widest')} value={code}
              placeholder={useRecovery ? 'xxxxx-xxxxx' : '000000'} onChange={(e) => setCode(e.target.value)} />
            <button type="button" onClick={() => { setUseRecovery((v) => !v); setCode(''); }} className="mt-2 text-xs font-medium text-primary hover:underline">
              {useRecovery ? t('Dùng mã từ ứng dụng xác thực') : t('Dùng mã khôi phục')}
            </button>
          </div>
        )}

        {error && <ErrorBox>{error}</ErrorBox>}
        {info && <InfoBox>{info}</InfoBox>}

        <Button variant="primary" type="submit" className="w-full" disabled={busy || (mode !== '2fa' && !email) || (mode !== 'forgot' && mode !== '2fa' && !password) || (mode === '2fa' && !code)}>
          {busy ? t('Đang xử lý…')
            : mode === 'login' ? t('Đăng nhập')
            : mode === 'register' ? t('Tạo tài khoản')
            : mode === 'forgot' ? t('Gửi liên kết đặt lại')
            : t('Xác nhận')}
        </Button>

        {(mode === 'forgot' || mode === '2fa') && (
          <Button type="button" variant="ghost" className="w-full" onClick={() => switchTo('login')}>{t('Quay lại đăng nhập')}</Button>
        )}
      </form>

      {config?.google && (mode === 'login' || mode === 'register') && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-fg"><span className="h-px flex-1 bg-border" />{t('hoặc')}<span className="h-px flex-1 bg-border" /></div>
          <a href={`/api/auth/google?next=${encodeURIComponent(next())}`}
            className="flex h-10 w-full items-center justify-center gap-2.5 rounded-lg border bg-card text-sm font-medium transition hover:bg-muted">
            <GoogleIcon /> {t('Tiếp tục với Google')}
          </a>
        </>
      )}
    </AuthCard>
  );
}

export default function LoginPage() {
  return <Suspense><AuthFlow /></Suspense>;
}
