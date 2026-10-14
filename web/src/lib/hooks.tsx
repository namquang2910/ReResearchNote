'use client';
import { t } from './i18n';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { getLang } from './i18n';
import type { ExpTask, GlobalNote, LibraryItem, Page, ProfileStats, Project, ProjectNote, ProjectSummary, SearchResult, Status, TaskDetail } from './types';

/* ---------- toast ---------- */
const ToastCtx = createContext<(msg: string, kind?: 'error' | 'ok') => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; kind: string }[]>([]);
  const push = useCallback((msg: string, kind: 'error' | 'ok' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, msg, kind }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className={`animate-fade rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-pop ${t.kind === 'error' ? 'bg-blocked' : 'bg-slate-900'}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- queries ---------- */
export const useProjects = () => useQuery({ queryKey: ['projects'], queryFn: () => api.get<ProjectSummary[]>('/projects') });
export const useProject = (id: string) => useQuery({ queryKey: ['project', id], queryFn: () => api.get<Project>(`/projects/${id}`) });
export const useTask = (id: string | null) =>
  useQuery({ queryKey: ['task', id], queryFn: () => api.get<TaskDetail>(`/tasks/${id}`), enabled: !!id });
export const useExperiments = () => useQuery({ queryKey: ['experiments'], queryFn: () => api.get<ExpTask[]>('/experiments') });
export const useAllNotes = () =>
  useInfiniteQuery({
    queryKey: ['allNotes'],
    initialPageParam: '',
    queryFn: ({ pageParam }) => api.get<Page<GlobalNote>>(`/notes?limit=60${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
export const useSearch = (q: string) =>
  useQuery({ queryKey: ['search', q], queryFn: () => api.get<SearchResult>(`/search?q=${encodeURIComponent(q)}`), enabled: q.trim().length > 0 });
export const useProfileStats = (projectId = '') =>
  useQuery({ queryKey: ['profile', projectId], queryFn: () => api.get<ProfileStats>(`/profile/stats${projectId ? `?projectId=${projectId}` : ''}`) });
export const useLibrary = () => useQuery({ queryKey: ['library'], queryFn: () => api.get<LibraryItem[]>('/library') });
export const useProjectNotes = (id: string) =>
  useInfiniteQuery({
    queryKey: ['notes', id],
    initialPageParam: '',
    queryFn: ({ pageParam }) => api.get<Page<ProjectNote>>(`/projects/${id}/notes?limit=60${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

/* ---------- actions ---------- */
export function useActions(projectId?: string) {
  const qc = useQueryClient();
  const toast = useToast();

  return useMemo(() => {
    /** chạy một request, làm mới cache, báo lỗi nếu có */
    async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
      try {
        const r = await fn();
        await qc.invalidateQueries();
        return r;
      } catch (e: any) {
        toast(e.message ?? t("Có lỗi xảy ra"), 'error');
        return undefined;
      }
    }
    return {
      createSample: () => run(() => api.post<{ id: string }>(`/projects/sample?lang=${getLang()}`)),
      createProject: (b: { title: string; description?: string; metrics?: string[] }) => run(() => api.post<{ id: string }>('/projects', b)),
      updateProject: (b: { title?: string; description?: string; favorite?: boolean; color?: string }) => run(() => api.patch(`/projects/${projectId}`, b)),
      setProject: (id: string, b: { favorite?: boolean; color?: string }) => run(() => api.patch(`/projects/${id}`, b)),
      // không chờ refetch của chính dự án vừa xóa (sẽ 404): bỏ nó khỏi cache rồi làm mới phần còn lại ở nền
      deleteProject: async () => {
        try {
          await api.del(`/projects/${projectId}`);
          qc.removeQueries({ queryKey: ['project', projectId] });
          void qc.invalidateQueries();
          return { ok: true };
        } catch (e: any) {
          toast(e.message ?? t("Có lỗi xảy ra"), 'error');
          return undefined;
        }
      },

      createTask: (title: string) => run(() => api.post<{ id: string }>(`/projects/${projectId}/tasks`, { title })),
      updateTask: (id: string, b: { title?: string; description?: string; status?: Status; dueDate?: string | null }) => {
        if (b.status) {
          qc.setQueryData<Project>(['project', projectId], (p) =>
            p && { ...p, tasks: p.tasks.map((t) => (t.id === id ? { ...t, status: b.status! } : t)) });
        }
        return run(() => api.patch(`/tasks/${id}`, b));
      },
      deleteTask: (id: string) => run(() => api.del(`/tasks/${id}`)),
      setLabels: (id: string, ids: string[]) => run(() => api.put(`/tasks/${id}/labels`, { ids })),
      addDep: (id: string, dependsOnId: string) => run(() => api.post(`/tasks/${id}/deps`, { dependsOnId })),
      removeDep: (id: string, depId: string) => run(() => api.del(`/tasks/${id}/deps/${depId}`)),

      addItem: (taskId: string, kind: string, b: object) => run(() => api.post(`/tasks/${taskId}/${kind}`, b)),
      updateItem: (kind: string, id: string, b: object) => run(() => api.patch(`/items/${kind}/${id}`, b)),
      removeItem: (kind: string, id: string) => run(() => api.del(`/items/${kind}/${id}`)),

      addMetric: (b: { name: string; unit?: string; better?: 'high' | 'low' }) => run(() => api.post(`/projects/${projectId}/metrics`, b)),
      updateMetric: (id: string, b: object) => run(() => api.patch(`/metrics/${id}`, b)),
      removeMetric: (id: string) => run(() => api.del(`/metrics/${id}`)),
      reorderMetrics: (ids: string[]) => run(() => api.post(`/projects/${projectId}/metrics/reorder`, { ids })),

      createStatus: (b: { name: string; color?: string; kind?: string }) => run(() => api.post('/statuses', b)),
      updateStatus: (id: string, b: { name?: string; color?: string; kind?: string }) => run(() => api.patch(`/statuses/${id}`, b)),
      deleteStatus: (id: string, moveTo?: string) => run(() => api.del(`/statuses/${id}${moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : ''}`)),
      reorderStatuses: (ids: string[]) => run(() => api.post('/statuses/reorder', { ids })),

      addLabel: (name: string, color?: string) => run(() => api.post<{ id: string }>(`/projects/${projectId}/labels`, { name, color })),
      updateLabel: (id: string, b: object) => run(() => api.patch(`/labels/${id}`, b)),
      removeLabel: (id: string) => run(() => api.del(`/labels/${id}`)),
    };
  }, [qc, toast, projectId]);
}
export type Actions = ReturnType<typeof useActions>;

/* ---------- project context ---------- */
interface Ctx { project: Project; taskId: string | null; reqTab: string | null; openTask: (id: string | null, tab?: string) => void; actions: Actions }
export const ProjectCtx = createContext<Ctx | null>(null);
export const useProjectCtx = () => {
  const c = useContext(ProjectCtx);
  if (!c) throw new Error('ProjectCtx missing');
  return c;
};
