'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Flame, Target, Trophy } from 'lucide-react';
import { useProfileStats, useProjects } from '@/lib/hooks';
import { dateLocale, t } from '@/lib/i18n';
import { usePrefs } from '@/lib/prefs';
import { useAuth } from '@/lib/auth';
import SecurityCard from '@/components/SecurityCard';
import { api } from '@/lib/api';
import { useToast } from '@/lib/hooks';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button, Card, Modal, Segmented, Spinner, inputCls } from '@/components/ui';
import Heatmap, { HeatLegend, type HeatDay } from '@/components/Heatmap';

type Mode = 'all' | 'completed';
const KIND_ORDER = ['completed', 'created', 'logs', 'notes', 'comments', 'commits', 'changes'] as const;
const KIND_LABEL: Record<(typeof KIND_ORDER)[number], string> = {
  completed: 'đã hoàn thành', created: 'task mới', logs: 'log metric', notes: 'note', comments: 'comment', commits: 'commit', changes: 'thay đổi',
};

function Stat({ icon, label, value, sub }: { icon?: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-fg">{icon}{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-fg">{sub}</div>}
    </div>
  );
}

export default function ProfilePage() {
  const { lang, setLang, theme, setTheme } = usePrefs();
  const { user, updateName, logout } = useAuth();
  const name = user?.name || user?.email.split('@')[0] || '';
  const router = useRouter();
  const toast = useToast();
  const [pw, setPw] = useState({ current: '', next: '' });
  const [delPw, setDelPw] = useState('');
  const [delOpen, setDelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data: projects } = useProjects();
  const [projectId, setProjectId] = useState('');
  const [mode, setMode] = useState<Mode>('all');
  const [hover, setHover] = useState<HeatDay | null>(null);
  const [goal, setGoal] = useState(5);
  const [nameDraft, setNameDraft] = useState('');
  const { data: stats, isLoading } = useProfileStats(projectId);
  const { data: all } = useProfileStats('');

  useEffect(() => { try { const g = parseInt(localStorage.getItem('weeklyGoal') ?? '', 10); if (g > 0) setGoal(g); } catch {} }, []);
  useEffect(() => { setNameDraft(name); }, [name]);
  const saveGoal = (g: number) => { setGoal(g); try { localStorage.setItem('weeklyGoal', String(g)); } catch {} };

  const days: HeatDay[] = useMemo(() => (stats?.days ?? []).map((d) => ({ date: d.date, value: mode === 'all' ? d.total : d.completed })), [stats, mode]);
  const total = days.reduce((s, d) => s + d.value, 0);
  const detail = hover && stats?.days.find((d) => d.date === hover.date);
  const bestWd = stats ? stats.byWeekday.indexOf(Math.max(...stats.byWeekday)) : -1;
  const wdNames = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(dateLocale(), { weekday: 'long' })), []);
  const diff = stats ? stats.thisWeek.completed - stats.lastWeek.completed : 0;
  const display = name || '?';

  if (isLoading || !stats) return <div className="flex flex-1 items-center justify-center"><Spinner /></div>;
  const goalPct = Math.min(100, Math.round((stats.thisWeek.completed / goal) * 100));
  const onTimePct = stats.onTime.done ? Math.round((stats.onTime.onTime / stats.onTime.done) * 100) : null;

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-5xl space-y-5 px-6 py-8 md:px-8">
        {/* Header */}
        <header className="flex flex-wrap items-center gap-5">
          <div className="flex h-16 w-16 flex-none items-center justify-center rounded-full bg-primary text-2xl font-semibold text-primary-fg">
            {display.trim().charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} onBlur={() => nameDraft.trim() !== (user?.name ?? '') && updateName(nameDraft.trim())}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              placeholder={t('Tên hiển thị')}
              className="-ml-2 w-full max-w-sm rounded-lg border border-transparent bg-transparent px-2 py-0.5 text-2xl font-semibold tracking-tight outline-none hover:border-border focus:border-primary" />
            <p className="text-sm text-muted-fg">{user?.email} · {t('Năng suất và tiến độ của riêng bạn')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented value={lang} onChange={setLang} options={[{ value: 'vi', label: 'Tiếng Việt' }, { value: 'en', label: 'English' }]} />
            <Segmented value={theme} onChange={setTheme}
              options={[{ value: 'light', label: t('Sáng') }, { value: 'dark', label: t('Tối') }, { value: 'system', label: t('Theo hệ thống') }]} />
          </div>
        </header>

        {/* Chỉ số */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label={t('Tuần này')} value={stats.thisWeek.completed}
            sub={<>{t('task hoàn thành')} · <span className={cn(diff > 0 && 'text-done', diff < 0 && 'text-blocked')}>{diff > 0 ? '+' : ''}{diff} {t('so với tuần trước')}</span></>} />
          <Stat icon={<Flame size={13} />} label={t('Chuỗi hiện tại')} value={t('{n} ngày', { n: stats.streak.current })} sub={t('ngày liên tiếp có hoạt động')} />
          <Stat icon={<Trophy size={13} />} label={t('Chuỗi dài nhất')} value={t('{n} ngày', { n: stats.streak.longest })} />
          <Stat label={t('Ngày hoạt động')} value={stats.activeDays} sub={t('trong 12 tháng qua')} />
          <Stat label={t('Đúng hạn')} value={onTimePct == null ? '—' : `${onTimePct}%`}
            sub={onTimePct == null ? t('Chưa có task có hạn đã xong') : t('{a}/{b} task có hạn', { a: stats.onTime.onTime, b: stats.onTime.done })} />
        </div>

        {/* Heatmap */}
        <Card
          title={t('{n} hoạt động trong 12 tháng qua', { n: total })}
          right={
            <div className="flex flex-wrap items-center gap-2">
              <select className={cn(inputCls, 'h-8 w-44 py-0 text-xs')} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">{t('Tất cả dự án')}</option>
                {projects?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              <Segmented value={mode} onChange={setMode} options={[{ value: 'all', label: t('Mọi hoạt động') }, { value: 'completed', label: t('Task hoàn thành') }]} />
            </div>
          }>
          <Heatmap days={days} onHover={setHover} selected={hover?.date} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-h-5 text-xs text-muted-fg">
              {hover && detail ? (
                <>
                  <b className="text-fg">{new Date(detail.date + 'T00:00:00').toLocaleDateString(dateLocale(), { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</b>
                  {' — '}
                  {detail.total === 0 ? t('không có hoạt động')
                    : t('{n} hoạt động', { n: detail.total }) + ': ' + KIND_ORDER.filter((k) => detail[k] > 0).map((k) => `${detail[k]} ${t(KIND_LABEL[k])}`).join(' · ')}
                </>
              ) : t('Tính các hoạt động: task mới, task hoàn thành, log metric, note, comment, commit và thay đổi.')}
            </div>
            <HeatLegend />
          </div>
        </Card>

        <div className="grid gap-5 lg:grid-cols-3">
          {/* Mục tiêu tuần */}
          <Card title={t('Mục tiêu tuần')}>
            <div className="flex items-center gap-2 text-sm text-muted-fg">
              <Target size={15} />
              <span>{t('Mục tiêu: hoàn thành')}</span>
              <input type="number" min={1} max={99} value={goal} onChange={(e) => saveGoal(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className={cn(inputCls, 'h-8 w-16 py-0 text-center')} />
              <span>{t('task mỗi tuần')}</span>
            </div>
            <div className="mt-4 text-3xl font-semibold tabular-nums">{stats.thisWeek.completed}<span className="text-lg text-muted-fg"> / {goal}</span></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${goalPct}%` }} /></div>
            <p className="mt-2 text-xs text-muted-fg">
              {stats.thisWeek.completed >= goal ? t('Đã đạt mục tiêu tuần này 🎉') : t('Còn {n} task nữa để đạt mục tiêu', { n: goal - stats.thisWeek.completed })}
            </p>
          </Card>

          {/* Theo ngày trong tuần */}
          <Card title={t('Hoàn thành theo ngày trong tuần')} className="lg:col-span-2">
            {Math.max(...stats.byWeekday) === 0 ? (
              <p className="py-6 text-center text-sm text-muted-fg">{t('Chưa có task hoàn thành trong 12 tháng qua.')}</p>
            ) : (
              <>
                <div className="flex h-28 items-end gap-3">
                  {stats.byWeekday.map((n, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1.5">
                      <span className="text-xs tabular-nums text-muted-fg">{n}</span>
                      <div className={cn('w-full rounded-md', i === bestWd ? 'bg-primary' : 'bg-primary/30')}
                        style={{ height: `${Math.max(4, (n / Math.max(...stats.byWeekday)) * 72)}px` }} />
                      <span className="text-[11px] text-muted-fg">{t(['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][i])}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-fg">{t('Ngày hiệu quả nhất')}: <b className="text-fg capitalize">{wdNames[bestWd]}</b></p>
              </>
            )}
          </Card>
        </div>

        {/* Từng dự án */}
        <Card title={t('Tiến độ từng dự án')}>
          {!all?.projects.length ? <p className="py-6 text-center text-sm text-muted-fg">{t('Chưa có dự án nào.')}</p> : (
            <ul className="divide-y">
              {[...all.projects].sort((a, b) => b.doneThisWeek - a.doneThisWeek || Object.keys(b.activity).length - Object.keys(a.activity).length).map((p) => {
                const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
                const act: HeatDay[] = all.days.slice(-182).map((d) => ({ date: d.date, value: p.activity[d.date] ?? 0 }));
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
                    <div className="min-w-[220px] flex-1">
                      <Link href={`/projects/${p.id}`} className="flex items-center gap-2 font-medium hover:underline">
                        <span className="h-3 w-3 flex-none rounded" style={{ background: p.color }} />
                        <span className="truncate">{p.title}</span>
                      </Link>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: p.color }} /></div>
                        <span className="w-10 text-right text-sm font-semibold tabular-nums">{pct}%</span>
                      </div>
                      <div className="mt-1.5 text-xs text-muted-fg">
                        {t('{done}/{total} task xong', { done: p.done, total: p.total })}
                        {p.running > 0 && <> · {t('{n} đang chạy', { n: p.running })}</>}
                        {' · '}<span className={cn(p.doneThisWeek > p.doneLastWeek && 'text-done')}>{t('+{n} tuần này', { n: p.doneThisWeek })}</span>
                      </div>
                    </div>
                    <div className="flex-none" title={t('26 tuần gần đây')}>
                      <Heatmap days={act} color={p.color} cell={9} gap={2} showLabels={false} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <SecurityCard />

        {/* Dữ liệu & tài khoản */}
        <Card title={t('Dữ liệu và tài khoản')}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="mb-1 text-sm font-medium">{t('Dữ liệu của bạn')}</div>
              <p className="text-xs text-muted-fg">{t('Tải toàn bộ dự án, task, log, note của bạn dưới dạng JSON.')}</p>
            </div>
            <Button onClick={async () => {
              try {
                const data = await api.get('/auth/export');
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
                a.download = `research-notes-${new Date().toISOString().slice(0, 10)}.json`; a.click();
              } catch (e: any) { toast(e.message, 'error'); }
            }}>{t('Xuất dữ liệu (JSON)')}</Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
            <Button onClick={async () => { await logout(); router.replace('/login'); }}>{t('Đăng xuất')}</Button>
            <Button variant="danger" onClick={() => setDelOpen(true)}>{t('Xóa tài khoản')}</Button>
          </div>
        </Card>
      </div>

      <Modal open={delOpen} onClose={() => setDelOpen(false)} title={t('Xóa tài khoản')}>
        <div className="space-y-3">
          <p className="text-sm text-muted-fg">{t('Toàn bộ dự án, task, log và note của bạn sẽ bị xóa vĩnh viễn. Không thể hoàn tác.')}</p>
          <input type={user?.hasPassword ? 'password' : 'email'} autoFocus placeholder={user?.hasPassword ? t('Nhập mật khẩu để xác nhận') : t('Nhập email của bạn để xác nhận')} className={inputCls} value={delPw} onChange={(e) => setDelPw(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDelOpen(false)}>{t('Hủy')}</Button>
            <Button variant="danger" disabled={!delPw || busy} onClick={async () => {
              setBusy(true);
              try { await api.del('/auth/me', user?.hasPassword ? { password: delPw } : { email: delPw }); await logout().catch(() => {}); router.replace('/login'); }
              catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
            }}>{t('Xóa vĩnh viễn')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
