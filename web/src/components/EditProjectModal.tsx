'use client';
import { t } from '@/lib/i18n';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Star, Trash2 } from 'lucide-react';
import { useActions } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Button, Modal, inputCls } from './ui';
import { ColorPicker } from './SettingsModals';

export interface EditableProject { id: string; title: string; description: string; color: string; favorite: boolean; taskCount?: number }

/** Chỉnh sửa một dự án: tên, mô tả, màu, yêu thích, và xóa. */
export default function EditProjectModal({ project, onClose }: { project: EditableProject | null; onClose: () => void }) {
  const actions = useActions(project?.id);
  const router = useRouter();
  const pathname = usePathname();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [fav, setFav] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (project) { setTitle(project.title); setDesc(project.description); setColor(project.color); setFav(project.favorite); }
  }, [project]);

  if (!project) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;
  const dirty = title.trim() !== project.title || desc !== project.description || color !== project.color || fav !== project.favorite;

  async function save() {
    if (!title.trim()) return;
    setBusy(true);
    const r = await actions.updateProject({ title: title.trim(), description: desc, color, favorite: fav });
    setBusy(false);
    if (r) onClose();
  }

  async function remove() {
    const n = project!.taskCount;
    if (!confirm(n ? t('Xóa dự án “{name}” cùng {n} task? Không thể hoàn tác.', { name: project!.title, n }) : t('Xóa dự án “{name}”? Không thể hoàn tác.', { name: project!.title }))) return;
    setBusy(true);
    const r = await actions.deleteProject();
    setBusy(false);
    if (r) {
      onClose();
      if (pathname.startsWith(`/projects/${project!.id}`)) router.push('/');
    }
  }

  return (
    <Modal open onClose={onClose} title={t("Chỉnh sửa dự án")}>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-fg">{t("Tên dự án")}</label>
          <input autoFocus className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-fg">{t("Mô tả")}</label>
          <textarea className={inputCls} rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t("Mục tiêu, phạm vi của dự án…")} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-fg">{t("Màu nhận diện")}</label>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <button type="button" onClick={() => setFav((f) => !f)}
          className={cn('flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition', fav ? 'border-amber-400 bg-amber-500/10' : 'hover:bg-muted')}>
          <Star size={17} className={fav ? 'fill-amber-500 text-amber-500' : 'text-muted-fg'} />
          <span className="flex-1">{fav ? t("Đang ở Favorites (hiện ở sidebar)") : t("Ghim vào Favorites ở sidebar")}</span>
        </button>

        <div className="flex items-center justify-between gap-2 border-t pt-4">
          <Button variant="danger" onClick={remove} disabled={busy}><Trash2 size={15} /> {t("Xóa dự án")}</Button>
          <div className="flex gap-2">
            <Button onClick={onClose}>{t("Hủy")}</Button>
            <Button variant="primary" onClick={save} disabled={!title.trim() || !dirty || busy}>{t("Lưu thay đổi")}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
