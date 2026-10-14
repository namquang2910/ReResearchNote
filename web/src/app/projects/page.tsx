'use client';
import { t } from '@/lib/i18n';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useActions, useProjects } from '@/lib/hooks';
import { Button, Spinner } from '@/components/ui';
import { NewProjectModal } from '@/components/Sidebar';
import ProjectCard from '@/components/ProjectCard';
import EditProjectModal, { type EditableProject } from '@/components/EditProjectModal';

export default function ProjectsPage() {
  const { data: projects, isLoading } = useProjects();
  const actions = useActions();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EditableProject | null>(null);
  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-6xl px-6 py-8 md:px-8">
        <header className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
            <p className="mt-1 text-sm text-muted-fg">{t('{n} dự án nghiên cứu', { n: projects?.length ?? 0 })}</p>
          </div>
          <Button variant="primary" onClick={() => setOpen(true)}><Plus size={16} /> {t("Dự án mới")}</Button>
        </header>
        {isLoading ? <div className="flex justify-center py-16"><Spinner /></div> : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects?.map((p) => <ProjectCard key={p.id} p={p} onFavorite={() => actions.setProject(p.id, { favorite: !p.favorite })} onEdit={() => setEditing({ id: p.id, title: p.title, description: p.description, color: p.color, favorite: p.favorite, taskCount: p.taskCount })} />)}
            <button onClick={() => setOpen(true)}
              className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-sm text-muted-fg transition hover:border-primary hover:text-primary">
              <Plus size={20} /> {t('Dự án mới')}
            </button>
            {projects?.length === 0 && (
              <button onClick={() => actions.createSample()}
                className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-sm text-muted-fg transition hover:border-primary hover:text-primary">
                {t('Thử với dự án mẫu')}
              </button>
            )}
          </div>
        )}
      </div>
      <NewProjectModal open={open} onClose={() => setOpen(false)} />
      <EditProjectModal project={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
