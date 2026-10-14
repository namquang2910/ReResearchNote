'use client';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';

export interface User { id: string; email: string; name: string; createdAt: string }

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  updateName: (name: string) => Promise<void>;
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

  /** Đổi người dùng => bỏ toàn bộ cache để không lẫn dữ liệu giữa các tài khoản. */
  const reset = useCallback((u: User | null) => {
    // giữ lại query ['me'] đang được AuthProvider theo dõi (qc.clear() sẽ làm nó mất kết nối)
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    qc.setQueryData(['me'], u);
  }, [qc]);

  const value = useMemo<AuthCtx>(() => ({
    user: data ?? null,
    loading: isLoading,
    login: async (email, password) => reset(await api.post<User>('/auth/login', { email, password })),
    register: async (email, password, name) => reset(await api.post<User>('/auth/register', { email, password, name })),
    logout: async () => { try { await api.post('/auth/logout'); } finally { reset(null); } },
    updateName: async (name) => { qc.setQueryData(['me'], await api.patch<User>('/auth/me', { name })); },
  }), [data, isLoading, reset, qc]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
