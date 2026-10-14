'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { Button, Spinner } from '@/components/ui';
import AuthCard, { ErrorBox, InfoBox } from '@/components/AuthCard';

function Verify() {
  const token = useSearchParams().get('token') ?? '';
  const { refresh } = useAuth();
  const [state, setState] = useState<'working' | 'ok' | 'error'>('working');
  const [msg, setMsg] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // StrictMode gọi effect hai lần; token chỉ dùng được một lần
    ran.current = true;
    if (!token) { setState('error'); setMsg(t('Liên kết xác minh không hợp lệ hoặc đã hết hạn')); return; }
    api.post('/auth/verify-email', { token })
      .then(() => { setState('ok'); refresh().catch(() => {}); })
      .catch((e) => { setState('error'); setMsg(e.message); });
  }, [token, refresh]);

  return (
    <AuthCard>
      {state === 'working' && <div className="flex items-center gap-3 text-sm"><Spinner /> {t('Đang xác minh email…')}</div>}
      {state === 'ok' && <InfoBox>{t('Email của bạn đã được xác minh.')}</InfoBox>}
      {state === 'error' && <ErrorBox>{msg}</ErrorBox>}
      <Link href="/"><Button variant="primary" className="w-full">{t('Vào ứng dụng')}</Button></Link>
    </AuthCard>
  );
}
export default function VerifyPage() { return <Suspense><Verify /></Suspense>; }
