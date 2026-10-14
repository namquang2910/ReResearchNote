'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export interface Suggestion { id: string; label: string; hint?: string; color?: string }

/**
 * Ô tìm kiếm có gợi ý: gõ để lọc, bấm (hoặc ↑↓ + Enter) để thêm.
 * Nếu tên chưa có thì hiện tùy chọn "Tạo mới".
 */
export default function SuggestInput({ items, existing = [], placeholder, onPick, onCreate, className, autoFocus }: {
  items: Suggestion[];
  /** tên đã có (không còn nằm trong gợi ý) — dùng để không cho tạo trùng */
  existing?: string[];
  placeholder: string;
  onPick: (s: Suggestion) => void | Promise<unknown>;
  onCreate?: (name: string) => void | Promise<unknown>;
  className?: string;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const term = q.trim().toLowerCase();
  const matches = useMemo(() => {
    const m = items.filter((i) => !term || i.label.toLowerCase().includes(term));
    // ưu tiên khớp đầu chuỗi
    return m.sort((a, b) => +!a.label.toLowerCase().startsWith(term) - +!b.label.toLowerCase().startsWith(term)).slice(0, 8);
  }, [items, term]);
  const exact = items.some((i) => i.label.toLowerCase() === term);
  const already = !!term && !exact && existing.some((n) => n.trim().toLowerCase() === term);
  const canCreate = !!onCreate && !!term && !exact && !already;
  const total = matches.length + (canCreate ? 1 : 0);
  const showList = total > 0 || already;

  useEffect(() => { setCursor(0); }, [term]);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  async function choose(idx: number) {
    if (idx < matches.length) await onPick(matches[idx]);
    else if (canCreate) await onCreate!(q.trim());
    setQ('');
    setCursor(0);
    inputRef.current?.focus();
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" />
      <input ref={inputRef} autoFocus={autoFocus} value={q} placeholder={placeholder}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setCursor((c) => Math.min(total - 1, c + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
          else if (e.key === 'Enter') { e.preventDefault(); if (total) choose(cursor); }
          else if (e.key === 'Escape') setOpen(false);
        }}
        className="h-10 w-full rounded-lg border bg-card pl-9 pr-3 text-sm outline-none transition placeholder:text-muted-fg/70 focus:border-primary focus:ring-4 focus:ring-primary/15" />
      {open && showList && (
        <ul className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-72 animate-fade overflow-auto rounded-xl border bg-card p-1.5 shadow-pop">
          {matches.map((m, i) => (
            <li key={m.id}>
              <button type="button" onMouseEnter={() => setCursor(i)} onClick={() => choose(i)}
                className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm', cursor === i && 'bg-muted')}>
                {m.color && <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: m.color }} />}
                <span className="min-w-0 flex-1 truncate">{m.label}</span>
                {m.hint && <span className="text-xs text-muted-fg">{m.hint}</span>}
              </button>
            </li>
          ))}
          {already && (
            <li className="px-2.5 py-2 text-sm text-muted-fg">{t('“{q}” đã có rồi.', { q: q.trim() })}</li>
          )}
          {canCreate && (
            <li>
              <button type="button" onMouseEnter={() => setCursor(matches.length)} onClick={() => choose(matches.length)}
                className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-primary', cursor === matches.length && 'bg-muted')}>
                <Plus size={15} className="flex-none" />
                <span className="truncate">{t('Tạo mới “{q}”', { q: q.trim() })}</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
