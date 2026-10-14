'use client';
import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/lib/hooks';
import { QuickAddProvider } from '@/components/QuickAdd';
import { PrefsProvider } from '@/lib/prefs';
import { AuthProvider } from '@/lib/auth';

export default function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 } } }));
  return (
    <QueryClientProvider client={client}>
      <PrefsProvider>
        <AuthProvider>
          <ToastProvider>
            <QuickAddProvider>{children}</QuickAddProvider>
          </ToastProvider>
        </AuthProvider>
      </PrefsProvider>
    </QueryClientProvider>
  );
}
