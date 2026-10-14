'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FlaskConical } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { usePrefs } from '@/lib/prefs';
import { cn } from '@/lib/utils';
import { Button, inputCls } from '@/components/ui';

function LoginForm() {
  const { user, loading, login, register } = useAuth();
  const { lang, setLang } = usePrefs();
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const next = () => {
    const n = new URLSearchParams(window.location.search).get('next') ?? '/';
    return n.startsWith('/') && !n.startsWith('//') ? n : '/'; // chỉ chuyển hướng nội bộ
  };
  useEffect(() => { if (!loading && user) router.replace(next()); }, [loading, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      if (mode === 'login') await login(email.trim(), password);
      else await register(email.trim(), password, name.trim());
      router.replace(next());
    } catch (err: any) {
      setError(err.message ?? t('Có lỗi'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-fg"><FlaskConical size={22} /></span>
        <span className="text-2xl font-semibold tracking-tight">ReSearch</span>
      </div>

      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow-card">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 text-sm font-medium">
          {(['login', 'register'] as const).map((m) => (
            <button key={m} type="button" onClick={() => { setMode(m); setError(''); }}
              className={cn('rounded-lg py-2 transition', mode === m ? 'bg-card shadow-card' : 'text-muted-fg hover:text-fg')}>
              {m === 'login' ? t('Đăng nhập') : t('Tạo tài khoản')}
            </button>
          ))}
        </div>

        {mode === 'register' && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-fg">{t('Tên hiển thị')}</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
        )}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-fg">Email</label>
          <input type="email" required autoFocus className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-fg">{t('Mật khẩu')}</label>
          <input type="password" required minLength={mode === 'register' ? 8 : undefined} className={inputCls} value={password}
            onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          {mode === 'register' && <p className="mt-1.5 text-xs text-muted-fg">{t('Tối thiểu 8 ký tự.')}</p>}
        </div>

        {error && <p role="alert" className="rounded-lg bg-blocked/10 px-3 py-2 text-sm text-blocked">{error}</p>}
        <Button variant="primary" type="submit" className="w-full" disabled={busy || !email || !password}>
          {busy ? t('Đang xử lý…') : mode === 'login' ? t('Đăng nhập') : t('Tạo tài khoản')}
        </Button>
      </form>

      <div className="mt-5 inline-flex rounded-lg bg-muted p-0.5 text-xs font-semibold">
        {(['vi', 'en'] as const).map((l) => (
          <button key={l} onClick={() => setLang(l)} className={cn('rounded-md px-3 py-1.5 transition', lang === l ? 'bg-card shadow-card' : 'text-muted-fg hover:text-fg')}>
            {l === 'vi' ? 'Tiếng Việt' : 'English'}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
