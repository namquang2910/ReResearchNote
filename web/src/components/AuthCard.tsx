'use client';
import type { ReactNode } from 'react';
import { FlaskConical } from 'lucide-react';
import { usePrefs } from '@/lib/prefs';
import { cn } from '@/lib/utils';

/** Khung chung cho các trang xác thực (đăng nhập, quên/đặt lại mật khẩu, xác minh email). */
export default function AuthCard({ children }: { children: ReactNode }) {
  const { lang, setLang } = usePrefs();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-fg"><FlaskConical size={22} /></span>
        <span className="text-2xl font-semibold tracking-tight">ReSearch</span>
      </div>
      <div className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow-card">{children}</div>
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

export const FieldLabel = ({ children }: { children: ReactNode }) => (
  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-fg">{children}</label>
);
export const ErrorBox = ({ children }: { children: ReactNode }) => (
  <p role="alert" className="rounded-lg bg-blocked/10 px-3 py-2 text-sm text-blocked">{children}</p>
);
export const InfoBox = ({ children }: { children: ReactNode }) => (
  <p role="status" className="rounded-lg bg-done/10 px-3 py-2 text-sm text-done">{children}</p>
);
