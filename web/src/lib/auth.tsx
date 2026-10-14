'use client';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';

export interface User {
  id: string; email: string; name: string; createdAt: string;
  emailVerified: boolean; totpEnabled: boolean; hasPassword: boolean; googleLinked: boolean;
}
export interface AuthConfig { registration: boolean; google: boolean; mail: boolean; requireVerification: boolean }

export type LoginResult =
  | { status: 'ok' }
  | { status: 'needs2fa'; ticket: string }
  | { status: 'needsVerification'; email: string };

interface AuthCtx {
  user: User | null;
  loading: boolean;
  config: AuthConfig | undefined;
  login: (email: string, password: string) => Promise<LoginResult>;
  twoFaLogin: (b: { ticket?: string; code?: string; recoveryCode?: string }) => Promise<void>;
  register: (email: string, password: string, name: string, lang: 'vi' | 'en') => Promise<LoginResult>;
  logout: () => Promise<void>;
  updateName: (name: string) => Promise<void>;
  refresh: () => Promise<void>;
}
const Ctx = createContext<AuthCtx | null>(null);
export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthProvider missing');
  return c;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try { return await api.get<User>('/auth/me'); }
      catch (e) { if (e instanceof ApiError && e.status === 401) return null; throw e; }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const { data: config } = useQuery({ queryKey: ['authConfig'], queryFn: () => api.get<AuthConfig>('/auth/config'), staleTime: 5 * 60_000 });

  /** Đổi người dùng => bỏ cache của dữ liệu để không lẫn giữa các tài khoản (giữ ['me'] đang được theo dõi). */
  const reset = useCallback((u: User | null) => {
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' && q.queryKey[0] !== 'authConfig' });
    qc.setQueryData(['me'], u);
  }, [qc]);

  const value = useMemo<AuthCtx>(() => ({
    user: data ?? null,
    loading: isLoading,
    config,
    login: async (email, password) => {
      const r = await api.post<User | { requires2fa: true; ticket: string }>('/auth/login', { email, password });
      if ('requires2fa' in r) return { status: 'needs2fa', ticket: r.ticket };
      reset(r);
      return { status: 'ok' };
    },
    twoFaLogin: async (b) => reset(await api.post<User>('/auth/2fa/login', b)),
    register: async (email, password, name, lang) => {
      const r = await api.post<User | { needsVerification: true; email: string }>('/auth/register', { email, password, name, lang });
      if ('needsVerification' in r) return { status: 'needsVerification', email: r.email };
      reset(r);
      return { status: 'ok' };
    },
    logout: async () => { try { await api.post('/auth/logout'); } finally { reset(null); } },
    updateName: async (name) => { qc.setQueryData(['me'], await api.patch<User>('/auth/me', { name })); },
    refresh: async () => { await qc.invalidateQueries({ queryKey: ['me'] }); },
  }), [data, isLoading, config, reset, qc]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
