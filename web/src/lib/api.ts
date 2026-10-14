import { t, tServer } from './i18n';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api';

export class ApiError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}

/** Phát khi API trả 401 ở route cần đăng nhập — AppShell lắng nghe để đưa về trang đăng nhập. */
export const AUTH_EXPIRED = 'auth:expired';

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(t('Không kết nối được API. Backend đã chạy ở cổng 4000 chưa?'));
  }
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); msg = Array.isArray(j.message) ? j.message.join(', ') : j.message ?? msg; } catch {}
    if (res.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/register') && typeof window !== 'undefined') {
      window.dispatchEvent(new Event(AUTH_EXPIRED));
    }
    throw new ApiError(tServer(msg), res.status);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(p: string) => req<T>('GET', p),
  post: <T>(p: string, b?: unknown) => req<T>('POST', p, b ?? {}),
  patch: <T>(p: string, b: unknown) => req<T>('PATCH', p, b),
  put: <T>(p: string, b: unknown) => req<T>('PUT', p, b),
  del: <T>(p: string, b?: unknown) => req<T>('DELETE', p, b),
};
