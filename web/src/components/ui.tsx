'use client';
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'ghost' | 'danger'; size?: 'sm' | 'md' };
export function Button({ variant = 'outline', size = 'md', className, ...p }: BtnProps) {
  return (
    <button
      {...p}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        variant === 'primary' && 'bg-primary text-primary-fg shadow-card hover:brightness-110',
        variant === 'outline' && 'border bg-card hover:bg-muted',
        variant === 'ghost' && 'text-muted-fg hover:bg-muted hover:text-fg',
        variant === 'danger' && 'border border-blocked/30 text-blocked hover:bg-blocked/10',
        className,
      )}
    />
  );
}

export const inputCls =
  'w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none transition placeholder:text-muted-fg/70 focus:border-primary focus:ring-4 focus:ring-primary/15';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('animate-spin text-muted-fg', className)} size={18} />;
}

export function Empty({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-14 text-center">
      {icon && <div className="mb-3 rounded-xl bg-soft p-3 text-primary">{icon}</div>}
      <div className="font-semibold">{title}</div>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted-fg">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Card({ title, right, children, className }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border bg-card p-5 shadow-card', className)}>
      {(title || right) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex rounded-lg bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn('rounded-md px-3 py-1.5 text-xs font-medium transition', value === o.value ? 'bg-card text-fg shadow-card' : 'text-muted-fg hover:text-fg')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; size?: 'md' | 'lg' }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade" onMouseDown={onClose}>
      <div className={cn('max-h-[90vh] w-full overflow-auto rounded-2xl border bg-card p-6 shadow-pop', size === 'lg' ? 'max-w-3xl' : 'max-w-md')} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted-fg hover:bg-muted"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Menu nổi đơn giản, đóng khi click ra ngoài. */
export function Popover({ trigger, children, align = 'left' }: { trigger: (open: boolean) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div ref={ref} className="relative inline-block">
      <div onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>{trigger(open)}</div>
      {open && (
        <div className={cn('absolute top-full z-40 mt-1.5 min-w-44 animate-fade rounded-xl border bg-card p-1.5 shadow-pop', align === 'right' ? 'right-0' : 'left-0')}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
