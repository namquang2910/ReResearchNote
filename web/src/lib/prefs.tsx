'use client';
import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setCurrentLang, type Lang } from './i18n';

export type ThemePref = 'light' | 'dark' | 'system';

interface Prefs {
  lang: Lang; setLang: (l: Lang) => void;
  theme: ThemePref; setTheme: (t: ThemePref) => void;
  resolved: 'light' | 'dark';
  name: string; setName: (n: string) => void;
}
const Ctx = createContext<Prefs | null>(null);
export const usePrefs = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('PrefsProvider missing');
  return c;
};

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} };

/** Ngôn ngữ, giao diện sáng/tối và tên hiển thị. Đổi ngôn ngữ sẽ dựng lại cây con (key) để mọi chuỗi cập nhật. */
export function PrefsProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('vi');
  const [theme, setThemeState] = useState<ThemePref>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');
  const [name, setNameState] = useState('');

  setCurrentLang(lang); // đồng bộ, trước khi con render

  useEffect(() => {
    const l = read('lang');
    if (l === 'vi' || l === 'en') setLangState(l);
    const t = read('theme');
    if (t === 'light' || t === 'dark' || t === 'system') setThemeState(t);
    setNameState(read('profileName') ?? '');
  }, []);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const r: 'light' | 'dark' = theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = r;
      setResolved(r);
    };
    apply();
    if (theme === 'system') { mq.addEventListener('change', apply); return () => mq.removeEventListener('change', apply); }
  }, [theme]);

  const setLang = useCallback((l: Lang) => { setLangState(l); write('lang', l); }, []);
  const setTheme = useCallback((t: ThemePref) => { setThemeState(t); write('theme', t); }, []);
  const setName = useCallback((n: string) => { setNameState(n); write('profileName', n); }, []);

  const value = useMemo(() => ({ lang, setLang, theme, setTheme, resolved, name, setName }), [lang, setLang, theme, setTheme, resolved, name, setName]);
  return <Ctx.Provider value={value}><Fragment key={lang}>{children}</Fragment></Ctx.Provider>;
}
