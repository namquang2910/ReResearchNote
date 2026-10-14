'use client';
import { t } from '@/lib/i18n';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Apple, Check, Copy, Download, RefreshCw, Trash2, Wifi } from 'lucide-react';
import { api } from '@/lib/api';
import { useProjects, useToast } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Button, Modal, Segmented, Spinner, inputCls } from './ui';

interface Feed { id: string; token: string; name: string; projectId: string | null; projectTitle: string | null; includeDone: boolean; path: string }
interface Base { label: string; url: string; kind: 'local' | 'lan' | 'public' }
interface FeedList { feeds: Feed[]; bases: Base[] }

export default function CalendarSyncModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: projects } = useProjects();
  const { data, isLoading } = useQuery({ queryKey: ['calendarFeeds'], queryFn: () => api.get<FeedList>('/calendar/feeds'), enabled: open });
  const [baseUrl, setBaseUrl] = useState('');
  const [scope, setScope] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const bases = data?.bases ?? [];
  useEffect(() => { if (data && !bases.some((b) => b.url === baseUrl)) setBaseUrl(bases.find((b) => b.kind === 'public')?.url ?? bases[0]?.url ?? ''); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // lần đầu mở: tự tạo một link cho mọi dự án
  useEffect(() => {
    if (open && data && data.feeds.length === 0) { api.post('/calendar/feeds', { name: t("Lịch ReSearch") }).then(() => qc.invalidateQueries({ queryKey: ['calendarFeeds'] })); }
  }, [open, data, qc]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['calendarFeeds'] });
  const run = async (fn: () => Promise<unknown>) => { try { await fn(); await refresh(); } catch (e: any) { toast(e.message ?? t("Có lỗi"), 'error'); } };

  const full = (f: Feed) => baseUrl + f.path;
  const webcal = (f: Feed) => full(f).replace(/^https?:/, 'webcal:');
  const base = bases.find((b) => b.url === baseUrl);

  async function copy(f: Feed) {
    try { await navigator.clipboard.writeText(full(f)); }
    catch { const t = document.createElement('textarea'); t.value = full(f); document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    setCopied(f.id);
    setTimeout(() => setCopied((c) => (c === f.id ? null : c)), 1800);
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title={t("Đồng bộ với Apple Calendar")}>
      <div className="space-y-5">
        <p className="text-sm text-muted-fg">
          {t('Đăng ký link bên dưới một lần, hạn chót của task sẽ tự xuất hiện trong lịch và tự cập nhật (khoảng 15 phút một lần). Chỉ đọc: sửa task ở đây, lịch tự theo.')}
        </p>

        {isLoading ? <div className="flex justify-center py-8"><Spinner /></div> : (
          <>
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-fg">{t("Địa chỉ truy cập")}</div>
              <Segmented value={baseUrl} onChange={setBaseUrl} options={bases.map((b) => ({ value: b.url, label: b.label }))} />
              <p className={cn('mt-2 flex items-start gap-1.5 text-xs', base?.kind === 'local' ? 'text-amber-600' : 'text-muted-fg')}>
                <Wifi size={13} className="mt-0.5 flex-none" />
                {base?.kind === 'local' && t("Chỉ hoạt động trên chính máy này (Mac đang chạy app). Muốn iPhone/iPad đăng ký, chọn địa chỉ Mạng LAN (cùng WiFi).")}
                {base?.kind === 'lan' && t("Dùng được trên thiết bị cùng mạng WiFi/LAN khi máy này đang bật.")}
                {base?.kind === 'public' && t("Địa chỉ công khai bạn đã cấu hình (PUBLIC_API_URL).")}
              </p>
            </div>

            <div className="space-y-3">
              {data?.feeds.map((f) => (
                <div key={f.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{f.name}</span>
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-fg">{f.projectTitle ?? t("Tất cả dự án")}</span>
                    <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-muted-fg">
                      <input type="checkbox" checked={f.includeDone} className="accent-[hsl(var(--primary))]"
                        onChange={(e) => run(() => api.patch(`/calendar/feeds/${f.id}`, { includeDone: e.target.checked }))} />
                      {t("Gồm task đã xong")}
                    </label>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input readOnly value={full(f)} onFocus={(e) => e.target.select()} className={cn(inputCls, 'h-9 flex-1 font-mono text-xs')} />
                    <Button size="sm" className="h-9" onClick={() => copy(f)}>
                      {copied === f.id ? <><Check size={14} /> {t("Đã chép")}</> : <><Copy size={14} /> {t("Sao chép")}</>}
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href={webcal(f)}>
                      <Button size="sm" variant="primary"><Apple size={14} /> {t("Mở trong Apple Calendar")}</Button>
                    </a>
                    <a href={full(f)} download="research-notes.ics"><Button size="sm"><Download size={14} /> {t("Tải .ics")}</Button></a>
                    <span className="flex-1" />
                    <Button size="sm" variant="ghost" title={t("Link cũ sẽ ngừng hoạt động")}
                      onClick={() => confirm(t('Tạo link mới? Link cũ sẽ ngừng hoạt động và các lịch đã đăng ký phải đăng ký lại.')) && run(() => api.post(`/calendar/feeds/${f.id}/regenerate`))}>
                      <RefreshCw size={14} /> {t('Tạo lại link')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => confirm(t('Xóa link này? Lịch đã đăng ký sẽ ngừng cập nhật.')) && run(() => api.del(`/calendar/feeds/${f.id}`))}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-end gap-2 rounded-xl bg-muted/60 p-3">
              <div className="min-w-48 flex-1">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-fg">{t("Tạo link riêng cho")}</label>
                <select className={inputCls} value={scope} onChange={(e) => setScope(e.target.value)}>
                  <option value="">{t("Tất cả dự án")}</option>
                  {projects?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>
              <Button onClick={() => run(() => api.post('/calendar/feeds', {
                projectId: scope || null,
                name: scope ? projects?.find((p) => p.id === scope)?.title : t("Lịch ReSearch"),
              }))}>{t("Tạo link")}</Button>
            </div>

            <details className="rounded-xl border p-4 text-sm">
              <summary className="cursor-pointer font-medium">{t("Cách đăng ký")}</summary>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-muted-fg">
                <li><b>Mac:</b> {t("bấm “Mở trong Apple Calendar” → Subscribe. Hoặc Calendar → File → New Calendar Subscription → dán link.")}</li>
                <li><b>iPhone/iPad:</b> {t("Cài đặt → Lịch → Tài khoản → Thêm tài khoản → Khác → Thêm lịch đã đăng ký → dán link (dùng địa chỉ Mạng LAN).")}</li>
                <li>{t("Trong hộp thoại đăng ký, đặt Auto-refresh = Every 15 minutes để cập nhật nhanh.")}</li>
                <li>{t("Google Calendar cũng dùng được: Other calendars → From URL (cần địa chỉ công khai https).")}</li>
              </ol>
              <p className="mt-3 text-xs text-muted-fg">{t("Ai có link đều đọc được tiêu đề task, nên đừng chia sẻ công khai. Bấm “Tạo lại link” nếu lộ.")}</p>
            </details>
          </>
        )}
      </div>
    </Modal>
  );
}
